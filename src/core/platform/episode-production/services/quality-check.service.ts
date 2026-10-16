/**
 * 产出质量自检 service（tasks/2026-09-16-ep-studio-polish · S-08）
 * @module platform/episode-production/services/quality-check.service
 *
 * checkEpisode(episodeId) 输出四项指标，供合成 tab「质量自检」面板渲染（红/黄/绿）：
 *
 *   1. keyframeRefs   关键帧参考图覆盖率（简化口径，对齐 keyframe-generation 的
 *                     collectReferenceImages 语义）：
 *                     - 有图关键帧占比：storyboard_keyframe.image_asset_id → image_assets
 *                       行存在且 image_path 非空；
 *                     - refs 记录占比：该 image_assets 行 metadata.referenceImageIds 非空
 *                       （生成时 collectReferenceImages 选出的参考图 ID 快照）。
 *   2. subtitleMatch  字幕↔对白覆盖率：SubtitleService.buildSrt 产出的条目文本，
 *                     与 scene_dialogues.text 的命中比例（逐条对白是否出现在 SRT 中）。
 *   3. durationDrift  片段时长偏差：非 superseded 片段中 |duration − est_duration| > 2s
 *                     的片段清单。
 *   4. vlmSimilarity  （可选）首帧与参考定妆图相似度：抽 1 个已完成片段的首帧 +
 *                     该片段首个出场角色的定妆主图，左右拼接后 callVLM 打 1-5 分。
 *                     未配置视觉模型（项目 config.scriptModel 非视觉模型，且启用 provider
 *                     中也没有任何视觉模型）时跳过并标注。
 *
 * 仅查询 + 一次 ffmpeg 抽帧 + 一次 VLM 调用，不修改业务数据。
 */

import * as fs from 'fs'
import * as path from 'path'
import type { DataSource } from 'typeorm'
import { VideoEpisodeRepository } from '@core/database/repositories/video-episode.repository'
import { EpisodeScriptRepository } from '@core/database/repositories/episode-script.repository'
import { SceneScriptRepository } from '@core/database/repositories/scene-script.repository'
import { StoryboardRepository } from '@core/database/repositories/storyboard.repository'
import { EpVideoSegmentRepository } from '@core/database/repositories/video-segment.repository'
import { StoryboardKeyframeRepository } from '@core/database/repositories/storyboard-keyframe.repository'
import { AssetImageRepository } from '@core/database/repositories/asset-image.repository'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import { TimelineBuilderService } from '../compose/timeline-builder.service'
import { SubtitleService } from '../compose/subtitle.service'
import { callVLM, extractJsonFromResponse, parseJsonString } from '@core/platform/services/ai-call'
import { resolveCapabilities } from '@core/platform/providers/llm/model-capability'
import type { ModelDefinition } from '@shared/types/provider-template.types'

/** 单项检查状态：绿 / 黄 / 红 / 跳过（UI 直接映射颜色） */
export type QualityCheckStatus = 'green' | 'yellow' | 'red' | 'skipped'

export interface KeyframeRefsReport {
  status: QualityCheckStatus
  /** 关键帧总数 */
  total: number
  /** image_assets 行存在且 image_path 非空的关键帧数 */
  withImage: number
  /** image_assets.metadata.referenceImageIds 非空的关键帧数 */
  withRefs: number
  /** withImage / total（total=0 时为 null） */
  imageCoverage: number | null
  /** withRefs / total */
  refsCoverage: number | null
  /** 缺图 / 缺 refs 的关键帧定位信息（storyboard 序号 + frameIndex） */
  missingImage: Array<{ storyboardId: string; shotNumber: number; frameIndex: number }>
  missingRefs: Array<{ storyboardId: string; shotNumber: number; frameIndex: number }>
}

export interface SubtitleMatchReport {
  status: QualityCheckStatus
  /** scene_dialogues 总行数（空文本行不计） */
  dialogueCount: number
  /** 文本在 SRT 中命中的行数 */
  hitCount: number
  /** hitCount / dialogueCount（无对白时为 null） */
  coverage: number | null
  /** 未命中对白的文本预览（截断 30 字） */
  missed: string[]
}

export interface DurationDriftReport {
  status: QualityCheckStatus
  /** 参与判定的片段数（有实际时长的非 superseded 片段） */
  measured: number
  /** |actual - est| > 2s 的片段清单 */
  deviations: Array<{
    segmentId: string
    seq: number
    estDuration: number | null
    actualDuration: number
    driftSec: number
  }>
}

export interface VlmSimilarityReport {
  status: QualityCheckStatus
  /** 1-5 相似度分（skipped / 失败时为 null） */
  score: number | null
  /** VLM 给出的理由（原文摘要） */
  reason: string | null
  /** 使用的模型定位（便于复核走了哪个视觉模型） */
  providerConfigId: string | null
  modelId: string | null
  /** 被抽检的片段 */
  segmentId: string | null
  /** 跳过 / 失败说明（如"未配置视觉模型，跳过相似度评分"） */
  note: string | null
}

export interface EpisodeQualityReport {
  episodeId: string
  checkedAt: string
  keyframeRefs: KeyframeRefsReport
  subtitleMatch: SubtitleMatchReport
  durationDrift: DurationDriftReport
  vlmSimilarity: VlmSimilarityReport
}

/** 片段时长偏差阈值（秒，design.md S-08 口径） */
const DURATION_DRIFT_THRESHOLD_SEC = 2

export class QualityCheckService {
  private readonly episodeRepo: VideoEpisodeRepository
  private readonly scriptRepo: EpisodeScriptRepository
  private readonly sceneRepo: SceneScriptRepository
  private readonly storyboardRepo: StoryboardRepository
  private readonly keyframeRepo: StoryboardKeyframeRepository
  private readonly segmentRepo: EpVideoSegmentRepository
  private readonly assetImageRepo: AssetImageRepository

  constructor(private readonly ds: DataSource) {
    this.episodeRepo = new VideoEpisodeRepository(ds)
    this.scriptRepo = new EpisodeScriptRepository(ds)
    this.sceneRepo = new SceneScriptRepository(ds)
    this.storyboardRepo = new StoryboardRepository(ds)
    this.keyframeRepo = new StoryboardKeyframeRepository(ds)
    this.segmentRepo = new EpVideoSegmentRepository(ds)
    this.assetImageRepo = new AssetImageRepository(ds)
  }

  async checkEpisode(episodeId: string): Promise<EpisodeQualityReport> {
    const episode = await this.episodeRepo.getById(episodeId)
    if (!episode) throw new Error('剧集不存在')

    const script = await this.scriptRepo.getByEpisodeId(episodeId)
    const scenes = script ? await this.sceneRepo.getByEpisodeScriptId(script.id) : []
    const storyboards = []
    for (const scene of scenes) {
      storyboards.push(...(await this.storyboardRepo.getBySceneScriptId(scene.id)))
    }

    const [keyframeRefs, subtitleMatch, durationDrift] = await Promise.all([
      this.checkKeyframeRefs(storyboards),
      this.checkSubtitleMatch(script?.id ?? null, scenes.map((s) => s.id)),
      this.checkDurationDrift(episodeId),
    ])
    // VLM 调用最贵（抽帧 + 一次模型请求），放最后且失败不拖垮整份报告
    const vlmSimilarity = await this.checkVlmSimilarity(episodeId, episode.projectId, scenes)

    return {
      episodeId,
      checkedAt: new Date().toISOString(),
      keyframeRefs,
      subtitleMatch,
      durationDrift,
      vlmSimilarity,
    }
  }

  // ─── ① 关键帧参考图覆盖率 ──────────────────────────────

  private async checkKeyframeRefs(
    storyboards: Awaited<ReturnType<StoryboardRepository['getBySceneScriptId']>>,
  ): Promise<KeyframeRefsReport> {
    const shotNumberById = new Map(storyboards.map((sb) => [sb.id, sb.shotNumber] as const))
    const keyframes = []
    for (const sb of storyboards) {
      keyframes.push(...(await this.keyframeRepo.listByStoryboard(sb.id)))
    }

    const imageAssetRepo = this.ds.getRepository(ImageAssetEntity)
    let withImage = 0
    let withRefs = 0
    const missingImage: KeyframeRefsReport['missingImage'] = []
    const missingRefs: KeyframeRefsReport['missingRefs'] = []

    for (const kf of keyframes) {
      const loc = {
        storyboardId: kf.storyboardId,
        shotNumber: shotNumberById.get(kf.storyboardId) ?? 0,
        frameIndex: kf.frameIndex,
      }
      const ia = kf.imageAssetId
        ? await imageAssetRepo.findOne({ where: { id: kf.imageAssetId } }).catch(() => null)
        : null
      if (!ia?.imagePath) {
        missingImage.push(loc)
      } else {
        withImage++
        const refIds = (ia.metadata as any)?.referenceImageIds
        if (Array.isArray(refIds) && refIds.length > 0) withRefs++
        else missingRefs.push(loc)
      }
    }

    const total = keyframes.length
    const imageCoverage = total > 0 ? withImage / total : null
    const refsCoverage = total > 0 ? withRefs / total : null
    // 无关键帧 → skipped；全有图且有 refs → 绿；有图但缺 refs → 黄；缺图 → 红
    let status: QualityCheckStatus = 'skipped'
    if (total > 0) {
      if (imageCoverage! < 1) status = 'red'
      else if (refsCoverage! < 1) status = 'yellow'
      else status = 'green'
    }
    return { status, total, withImage, withRefs, imageCoverage, refsCoverage, missingImage, missingRefs }
  }

  // ─── ② 字幕↔对白覆盖率 ────────────────────────────────

  /**
   * 口径：buildSrt 的 SRT 全文 vs scene_dialogues.text —— 每条非空对白文本
   * （去空白后）是否作为子串出现在 SRT 中。无剧本/无对白 → skipped。
   */
  private async checkSubtitleMatch(
    episodeScriptId: string | null,
    sceneIds: string[],
  ): Promise<SubtitleMatchReport> {
    const dialogueRepo = this.ds.getRepository(SceneDialogueEntity)
    const dialogues: string[] = []
    for (const sceneId of sceneIds) {
      const rows = await dialogueRepo
        .find({ where: { sceneScriptId: sceneId }, order: { sortOrder: 'ASC' } })
        .catch(() => [] as SceneDialogueEntity[])
      for (const d of rows) {
        const t = (d.text ?? '').trim()
        if (t) dialogues.push(t)
      }
    }
    if (!episodeScriptId || dialogues.length === 0) {
      return { status: 'skipped', dialogueCount: dialogues.length, hitCount: 0, coverage: null, missed: [] }
    }

    try {
      const timeline = await new TimelineBuilderService(this.ds).buildEpisodeTimeline(episodeScriptId)
      const srt = await new SubtitleService(this.ds).buildSrt(timeline)
      const srtNorm = srt.replace(/\s+/g, '')

      let hitCount = 0
      const missed: string[] = []
      for (const text of dialogues) {
        if (srtNorm.includes(text.replace(/\s+/g, ''))) hitCount++
        else missed.push(text.length > 30 ? `${text.slice(0, 30)}…` : text)
      }
      const coverage = hitCount / dialogues.length
      const status: QualityCheckStatus = coverage >= 0.9 ? 'green' : coverage >= 0.6 ? 'yellow' : 'red'
      return { status, dialogueCount: dialogues.length, hitCount, coverage, missed }
    } catch {
      // 时间线装配失败（如场景结构异常）不拖垮整份报告
      return { status: 'skipped', dialogueCount: dialogues.length, hitCount: 0, coverage: null, missed: ['字幕生成失败，未能比对'] }
    }
  }

  // ─── ③ 片段时长偏差 ────────────────────────────────────

  private async checkDurationDrift(episodeId: string): Promise<DurationDriftReport> {
    const all = await this.segmentRepo.listByEpisode(episodeId)
    const active = all.filter((s) => s.status !== 'superseded')
    const deviations: DurationDriftReport['deviations'] = []
    let measured = 0
    for (const seg of active) {
      if (seg.duration == null || seg.estDuration == null) continue
      measured++
      const drift = Math.abs(seg.duration - seg.estDuration)
      if (drift > DURATION_DRIFT_THRESHOLD_SEC) {
        deviations.push({
          segmentId: seg.id,
          seq: seg.seq,
          estDuration: seg.estDuration,
          actualDuration: seg.duration,
          driftSec: Math.round(drift * 10) / 10,
        })
      }
    }
    return {
      status: deviations.length === 0 ? 'green' : 'yellow',
      measured,
      deviations,
    }
  }

  // ─── ④ VLM 首帧↔定妆图相似度（可选） ────────────────────

  private async checkVlmSimilarity(
    episodeId: string,
    projectId: string,
    scenes: Awaited<ReturnType<SceneScriptRepository['getByEpisodeScriptId']>>,
  ): Promise<VlmSimilarityReport> {
    const skip = (note: string): VlmSimilarityReport => ({
      status: 'skipped', score: null, reason: null,
      providerConfigId: null, modelId: null, segmentId: null, note,
    })

    const vlm = await this.resolveVlmModel(projectId)
    if (!vlm) return skip('未配置视觉模型，跳过相似度评分')

    const segment = (await this.segmentRepo.listByEpisode(episodeId))
      .filter((s) => s.status !== 'superseded' && s.status === 'completed' && !!s.videoPath)
      .sort((a, b) => a.seq - b.seq)[0]
    if (!segment) return skip('暂无已完成片段，跳过相似度评分')

    // 参考定妆图：该片段所属场景第一个出场角色的主图
    const scene = scenes.find((s) => s.id === segment.sceneId)
    const firstCharBindingId = ((scene?.characters as any[] | null) ?? [])
      .map((c) => c?.characterBindingId)
      .find((id): id is string => !!id)
    if (!firstCharBindingId) return skip('该片段场景没有出场角色，跳过相似度评分')
    const mainImage = await this.assetImageRepo.getMainImage('character', firstCharBindingId)
    if (!mainImage?.imagePath) return skip('出场角色没有定妆主图，跳过相似度评分')

    const dataPath = getPathProvider().getDataPath()
    const videoAbs = path.isAbsolute(segment.videoPath!)
      ? segment.videoPath!
      : path.join(dataPath, segment.videoPath!)
    const refAbs = path.isAbsolute(mainImage.imagePath)
      ? mainImage.imagePath
      : path.join(dataPath, mainImage.imagePath)
    if (!fs.existsSync(videoAbs) || !fs.existsSync(refAbs)) {
      return skip('片段视频或定妆图文件不在磁盘上，跳过相似度评分')
    }

    const tmpDir = path.join(getPathProvider().getTempPath(), 'quality-check')
    const framePath = path.join(tmpDir, `${segment.id}-first.jpg`)
    try {
      const { extractFrame } = await import('../reference-video/ffmpeg-helpers')
      await extractFrame(videoAbs, 0, framePath)

      // callVLM 只接受单张图：把 参考定妆图（左）与 片段首帧（右）拼成一张对比图
      const sharp = (await import('sharp')).default
      const HEIGHT = 512
      const [refBuf, frameBuf] = await Promise.all([
        sharp(refAbs).resize({ height: HEIGHT }).jpeg({ quality: 85 }).toBuffer(),
        sharp(framePath).resize({ height: HEIGHT }).jpeg({ quality: 85 }).toBuffer(),
      ])
      const [refMeta, frameMeta] = await Promise.all([sharp(refBuf).metadata(), sharp(frameBuf).metadata()])
      const combined = await sharp({
        create: {
          width: (refMeta.width ?? HEIGHT) + (frameMeta.width ?? HEIGHT),
          height: HEIGHT,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .composite([
          { input: refBuf, left: 0, top: 0 },
          { input: frameBuf, left: refMeta.width ?? HEIGHT, top: 0 },
        ])
        .jpeg({ quality: 85 })
        .toBuffer()
      const dataUrl = `data:image/jpeg;base64,${combined.toString('base64')}`

      const response = await callVLM(
        '左图是角色的参考定妆图，右图是生成视频片段的首帧。请评估右帧中角色与左图定妆形象的相似程度' +
          '（面容 / 发型 / 服饰 / 整体风格），输出 JSON：{"score": 1到5的整数, "reason": "一句话理由"}。' +
          '5=完全一致，1=完全不像。',
        dataUrl,
        '你是视频角色一致性审查员，只输出 JSON，不要输出其它内容。',
        512,
        vlm.providerConfigId,
        vlm.modelId,
        { temperature: 0.1 },
      )

      let parsed: any
      try {
        parsed = extractJsonFromResponse(response)
      } catch {
        parsed = parseJsonString(response)
      }
      const score = Math.max(1, Math.min(5, Math.round(Number(parsed?.score) || 0)))
      const reason = typeof parsed?.reason === 'string' ? parsed.reason : null
      return {
        status: score >= 4 ? 'green' : score === 3 ? 'yellow' : 'red',
        score,
        reason,
        providerConfigId: vlm.providerConfigId,
        modelId: vlm.modelId,
        segmentId: segment.id,
        note: null,
      }
    } catch (e: any) {
      return {
        status: 'skipped', score: null, reason: null,
        providerConfigId: vlm.providerConfigId, modelId: vlm.modelId,
        segmentId: segment.id,
        note: `相似度评分失败：${e?.message ?? String(e)}`,
      }
    } finally {
      // 抽帧是临时产物，评完即删（失败也尽力清理）
      await fs.promises.rm(framePath, { force: true }).catch(() => undefined)
    }
  }

  /**
   * 解析可用的视觉模型：
   *   1. 项目 config.scriptModel（配了且具备视觉能力 → 用它）；
   *   2. 否则扫启用 provider 的模型列表，找第一个 supportsVision 的（default provider 优先）。
   * 都没有 → null。
   */
  private async resolveVlmModel(
    projectId: string,
  ): Promise<{ providerConfigId: string; modelId: string } | null> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.providerConfigs) return null

      const project = await db.videoProjects?.getById(projectId).catch(() => null)
      const sm = (project?.config as any)?.scriptModel as
        | { providerConfigId?: string; modelId?: string }
        | undefined
      if (sm?.providerConfigId && sm?.modelId) {
        const cfg = await db.providerConfigs.getById(sm.providerConfigId).catch(() => null)
        const def = (cfg?.models ?? []).find((m: ModelDefinition) => m.id === sm.modelId)
        if (cfg && resolveCapabilities(sm.modelId, def).supportsVision) {
          return { providerConfigId: sm.providerConfigId, modelId: sm.modelId }
        }
      }

      const enabled = await db.providerConfigs.getEnabled()
      enabled.sort((a, b) => Number(b.isDefault ?? 0) - Number(a.isDefault ?? 0))
      for (const cfg of enabled) {
        for (const m of (cfg.models ?? []) as ModelDefinition[]) {
          if (m.id && resolveCapabilities(m.id, m).supportsVision) {
            return { providerConfigId: cfg.id, modelId: m.id }
          }
        }
      }
      return null
    } catch {
      return null
    }
  }
}
