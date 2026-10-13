/**
 * 片段级视频生成 service（tasks/2026-09-04-ep-video-segment-redesign §5）
 * @module platform/episode-production/render/video/segment-video.service
 *
 * 与单镜生成的 VideoSegmentService 并列（单镜生成保留不动）：
 *   1. 按 segment_seq 取片段内分镜，拼接多镜头提示词（segment-planner.buildSegmentPrompt；
 *      2026-09-18 起含景别/角度/运镜标签 + 项目风格词，@[资产] 标记替换为资产名纯文本）
 *   2. 参考图模式下取首镜头的首尾关键帧（frame_role=start + end 各一张，end 缺则退首帧 1 张），
 *      2 张 refs → keyframes2video（O1 首尾帧锚定）
 *   3. 一次视频调用产出整段，写 segment.video_path / video_mode / duration / prompt 快照
 *   4. 状态机 pending → generating → completed/error；
 *      completed 后联动把片段内 shots 的 status 置 completed
 *
 * Provider adapter 依赖注入（双端共用 + mock 单测友好），复用现有 video provider 适配链。
 */

import type { DataSource } from 'typeorm'
import {
  EpVideoSegmentRepository,
  type EpVideoSegment,
} from '@core/database/repositories/video-segment.repository'
import { StoryboardRepository } from '@core/database/repositories/storyboard.repository'
import {
  StoryboardKeyframeRepository,
  type StoryboardKeyframe,
} from '@core/database/repositories/storyboard-keyframe.repository'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import {
  pickVideoMode,
  clampKeyframesToCapability,
  pickStartEndKeyframes,
  type VideoModeMatch,
} from './provider-capability-matcher'
import type {
  VideoProviderAdapter,
  VideoMode,
  VideoSegmentOutput,
  KeyframeInput,
} from './video-provider-adapter'
import { buildSegmentPrompt } from './segment-planner'
import { loadShotDialogues } from './shot-dialogue-loader'
import { resolveVideoParamsForEpisode } from './project-video-params'
import { assertKeyframeGate, evaluateKeyframeGate } from './keyframe-gate'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { KeyframeGenerationService } from '../keyframe/keyframe-generation.service'
import { advanceEpisodeStatusForStoryboard } from '../../workflow/episode-status-advance'
import {
  collectSegmentAssetRefs,
  buildAssetRefPrompt,
  annotateRefsWithSlots,
  type SegmentAssetRef,
} from './asset-ref-resolver'
import { ReferenceBoardService, type ReferenceBoardMember } from '../keyframe/reference-board.service'

const DEFAULT_WIDTH = 1920
const DEFAULT_HEIGHT = 1080

export interface GenerateSegmentVideoInput {
  segmentId: string
  /** 覆盖时长；不传用 segment.estDuration */
  durationSec?: number
  width?: number
  height?: number
  /** 强制 mode；不传按首镜关键帧数 + capabilities 自动选 */
  forceMode?: VideoMode
  /** 实际调用的 provider/model（仅记录到 segment 上，adapter 由调用方创建） */
  providerId?: string
  modelId?: string
  /** E3：人工强制跳过关键帧闸门（闸门拦截时 UI 让用户确认后重试传 true） */
  force?: boolean
}

export interface SegmentVideoResult {
  segmentId: string
  match: VideoModeMatch
  output: VideoSegmentOutput
  prompt: string
  /** 实际喂给 provider 的首帧参考图（若有） */
  keyframesUsed: KeyframeInput[]
  /** 联动置 completed 的分镜 ID */
  completedStoryboardIds: string[]
  /** assetRef2video：本段解析出的资产引用（声明段与 refs 来源，审计用） */
  assetRefs?: SegmentAssetRef[]
}

export class SegmentVideoService {
  private readonly segmentRepo: EpVideoSegmentRepository
  private readonly storyboardRepo: StoryboardRepository
  private readonly keyframeRepo: StoryboardKeyframeRepository
  private readonly imageAssetRepo: ImageAssetRepository

  constructor(
    private readonly ds: DataSource,
    private readonly adapter: VideoProviderAdapter,
  ) {
    this.segmentRepo = new EpVideoSegmentRepository(ds)
    this.storyboardRepo = new StoryboardRepository(ds)
    this.keyframeRepo = new StoryboardKeyframeRepository(ds)
    this.imageAssetRepo = new ImageAssetRepository(ds)
  }

  /** 生成一个视频片段并写回 segment.video_path（状态机 pending→generating→completed/error） */
  async generateForSegment(
    input: GenerateSegmentVideoInput,
  ): Promise<SegmentVideoResult> {
    const seg = await this.segmentRepo.getById(input.segmentId)
    if (!seg) throw new Error(`视频片段不存在: ${input.segmentId}`)

    const shots = await this.storyboardRepo.getBySegmentId(seg.id)
    if (shots.length === 0) {
      throw new Error(`视频片段 ${input.segmentId} 内没有分镜`)
    }

    /*
     * 一致性修复 v2（2026-09-21）：renderPath 默认 'assetRef' —— 提示词引用资产路径。
     * 关键帧（keyframes2video/image2video 的图源）已在雪麓山庄 v3 复盘中证实 11/11
     * 废帧（照抄参考板），故缺省改走资产主图参考；'keyframe' 仅作回切换。
     */
    const videoParamsEarly = await resolveVideoParamsForEpisode(this.ds, seg.episodeId)
    if ((videoParamsEarly.renderPath ?? 'assetRef') === 'assetRef' && input.forceMode !== 'keyframes2video') {
      return this.generateViaAssetRef(input, seg, shots, videoParamsEarly)
    }

    /*
     * R4（2026-09-21 v3 实测）：end 帧缺失/无图会静默降级 image2video，
     * H3 类单锚中段漂移（seg5 秦越变棕发实锤）。降级前先自动补生成 end 帧
     * （走完整生成 + 机器校验 + 重拍闭环），补不上才降级。
     * text2video / provider 不支持 keyframes2video 时补了也用不上，跳过。
     */
    if (input.forceMode !== 'text2video' && this.adapter.capabilities.keyframes) {
      await this.tryEnsureEndKeyframe(shots[0].id)
    }

    /*
     * E3 关键帧闸门（2026-09-21 雪麓山庄 v2 复盘）：参考图模式实际消费首镜头
     * 首尾关键帧，生成前强制校验 machineCheck.pass + review.status ∈ pass/skipped。
     * force=true 人工强制跳过；text2video 无关键帧输入不走闸门。
     */
    if (input.forceMode !== 'text2video' && !input.force) {
      const firstShotKfs = await this.keyframeRepo.listByStoryboard(shots[0].id)
      const gatedKfs: StoryboardKeyframe[] = []
      for (const kf of pickStartEndKeyframes(firstShotKfs)) {
        if (await this.resolveKeyframeImagePath(kf)) gatedKfs.push(kf)
      }
      if (gatedKfs.length > 0) {
        assertKeyframeGate(
          await evaluateKeyframeGate(this.ds, gatedKfs),
          `片段 #${seg.seq}（首镜 ${shots[0].shotNumber ?? shots[0].id}）`,
        )
      }
    }

    const width = input.width ?? DEFAULT_WIDTH
    const height = input.height ?? DEFAULT_HEIGHT
    const durationSec = Math.max(
      1,
      Math.round(input.durationSec ?? seg.estDuration ?? shots.reduce((n, s) => n + (s.duration || 3), 0)),
    )
    // D6：项目 config.videoQuality/videoSteps/stylePrompt 透传（未配置 → provider 默认）
    const videoParams = await resolveVideoParamsForEpisode(this.ds, seg.episodeId)
    // 台词段（2026-10-05）：links 表/JSON 列加载各镜头台词，结构化提交给音视频模型
    const dialogueMap = await loadShotDialogues(this.ds, shots)
    const prompt = buildSegmentPrompt(
      shots.map(s => ({
        frameDescription: s.frameDescription,
        duration: s.duration,
        shotType: s.shotType,
        cameraAngle: s.cameraAngle,
        cameraMovement: s.cameraMovement,
        dialogues: dialogueMap.get(s.id),
      })),
      { width, height, stylePrompt: videoParams.stylePrompt },
    )

    // generating + prompt 快照先落库（崩溃可追）
    await this.segmentRepo.update(seg.id, {
      status: 'generating',
      prompt,
      error: null,
      providerId: input.providerId ?? seg.providerId,
      modelId: input.modelId ?? seg.modelId,
    })

    try {
      const result = await this.invokeGeneration(seg, shots, {
        prompt,
        durationSec,
        width,
        height,
        forceMode: input.forceMode,
        quality: videoParams.quality,
        steps: videoParams.steps,
      })

      await this.segmentRepo.update(seg.id, {
        status: 'completed',
        videoPath: result.output.videoPath,
        videoMode: result.match.mode,
        duration: result.output.durationSec,
        error: null,
      })
      // 联动：片段内 shots status=completed（与单镜生成写回值一致）
      for (const shot of shots) {
        await this.storyboardRepo.setStatus(shot.id, 'completed')
      }

      // 状态闭环（2026-09-16 P0-CM2）：片段出片 → episode.producing
      await advanceEpisodeStatusForStoryboard(this.ds, shots[0].id, 'producing').catch(() => {})

      return {
        segmentId: seg.id,
        match: result.match,
        output: result.output,
        prompt,
        keyframesUsed: result.keyframesUsed,
        completedStoryboardIds: shots.map(s => s.id),
      }
    } catch (e: any) {
      await this.segmentRepo.update(seg.id, {
        status: 'error',
        error: e?.message ?? String(e),
      })
      throw e
    }
  }

  // ─── 内部 ──────────────────────────────────────────────

  /**
   * assetRef2video · 提示词引用资产路径（2026-09-21 一致性修复 v2，缺省唯一开通路径）。
   *
   * 1. collectSegmentAssetRefs：从分镜结构化字段解析本段资产主图（地点→角色→道具）
   * 2. ≥2 资产 → 编号参考板；1 资产 → 原图直传；0 资产 → 报错（纯文生不可用）
   * 3. prompt = 三段式声明段（主体外观来源，不锁构图）+ buildSegmentPrompt 正文
   * 4. adapter.imageToVideo：refs 语义 = 主体外观参考（H3 网关 1-ref 协议），非首帧锁定
   */
  private async generateViaAssetRef(
    input: GenerateSegmentVideoInput,
    seg: EpVideoSegment,
    shots: any[],
    videoParams: { quality?: 'high' | 'low'; steps?: number; stylePrompt?: string },
  ): Promise<SegmentVideoResult> {
    if (!this.adapter.imageToVideo) {
      throw new Error('当前 provider 未实现 imageToVideo（assetRef2video 依赖单图参考通道）')
    }
    // V1 provider 守卫（2026-09-25 一致性修复）：assetRef 路径的 refs 语义=主体外观；
    // image 语义=首帧的 provider（火山/百炼等）会把编号参考板当首帧烙进成片，必须显式拦截
    if (!this.adapter.capabilities.subjectReference) {
      throw new Error(
        '提示词引用资产模式要求视频 provider 支持「参考图=主体外观」语义（当前仅 ComfyUI H3 网关）：' +
          '请把视频模型切换为 ComfyUI 网关模型，或在项目视频设置中把渲染路径回切为关键帧（renderPath=keyframe）',
      )
    }

    const width = input.width ?? DEFAULT_WIDTH
    const height = input.height ?? DEFAULT_HEIGHT
    const durationSec = Math.max(
      1,
      Math.round(input.durationSec ?? seg.estDuration ?? shots.reduce((n, s) => n + ((s as any).duration || 3), 0)),
    )

    const dialogueMap = await loadShotDialogues(this.ds, shots as any)
    const basePrompt = buildSegmentPrompt(
      shots.map((s) => ({
        frameDescription: (s as any).frameDescription,
        duration: (s as any).duration,
        shotType: (s as any).shotType,
        cameraAngle: (s as any).cameraAngle,
        cameraMovement: (s as any).cameraMovement,
        dialogues: dialogueMap.get((s as any).id),
      })),
      { width, height, stylePrompt: videoParams.stylePrompt },
    )

    const refs = await collectSegmentAssetRefs(this.ds, shots as any)
    if (refs.length === 0) {
      throw new Error(
        `提示词引用资产模式：片段 #${seg.seq} 未解析到任何资产参考` +
          `（检查分镜的角色/地点/道具绑定，以及对应资产是否已有主图）`,
      )
    }

    // 兑现：≥2 资产 → 编号参考板；1 资产 → 原图直传
    let refPath: string
    let useBoard = false
    // 编号必须来自重排后 members（单一事实源）：ReferenceBoardService.build 跳过缺图
    // 成员后 sharp-worker 对幸存成员重排 slot，原始 refs 下标会与板上色块错位
    let boardMembers: ReferenceBoardMember[] | undefined
    if (refs.length >= 2) {
      const board = await new ReferenceBoardService().build(
        refs.map((r) => ({
          imagePath: r.imagePath,
          name: r.name,
          kind: r.kind,
          assetImageId: r.assetImageId,
        })),
      )
      refPath = board.path
      useBoard = true
      boardMembers = board.members
      console.log(
        `[segment-video] assetRef: 片段 #${seg.seq} 使用 ${refs.length} 资产参考板 ${board.path}` +
          `（${refs.map((r) => r.name).join('/')}）`,
      )
    } else {
      refPath = refs[0].imagePath
      console.log(`[segment-video] assetRef: 片段 #${seg.seq} 单资产参考 ${refs[0].name} ${refPath}`)
    }

    // 提示词引用资产（可见化）：镜头正文中每个资产名标注参考板编号，如「沈云萝（参考板第2号）」
    // 编号一律以重排后 board.members 为准（无板时为 undefined，走 refs 下标兼容路径）
    const annotatedPrompt = annotateRefsWithSlots(basePrompt, refs, boardMembers)
    const prompt = buildAssetRefPrompt(annotatedPrompt, refs, useBoard, boardMembers)

    // generating + prompt 快照先落库（崩溃可追）
    await this.segmentRepo.update(seg.id, {
      status: 'generating',
      prompt,
      error: null,
      providerId: input.providerId ?? seg.providerId,
      modelId: input.modelId ?? seg.modelId,
    })

    const { createLogger } = await import('@core/utils/logger')
    const aiLogger = createLogger('ai-call')
    const t0 = Date.now()
    const onTaskId = async (taskId: string) => {
      await this.segmentRepo.update(seg.id, { providerTaskId: taskId })
    }

    try {
      const output = await this.adapter.imageToVideo({
        imagePath: refPath,
        prompt,
        durationSec,
        width,
        height,
        quality: videoParams.quality,
        steps: videoParams.steps,
        onTaskId,
      })
      await this.segmentRepo.update(seg.id, {
        status: 'completed',
        videoPath: output.videoPath,
        videoMode: 'assetRef2video',
        duration: output.durationSec,
        error: null,
      })
      for (const shot of shots) {
        await this.storyboardRepo.setStatus(shot.id, 'completed')
      }
      await advanceEpisodeStatusForStoryboard(this.ds, shots[0].id, 'producing').catch(() => {})
      aiLogger.info('video 调用完成（assetRef 片段级）', {
        callType: 'video' as const,
        mode: 'assetRef2video',
        segmentId: seg.id,
        userPrompt: prompt,
        referenceImages: [refPath],
        assetRefs: refs.map((r) => `${r.kind}:${r.name}`),
        durationMs: Date.now() - t0,
      })
      return {
        segmentId: seg.id,
        match: { mode: 'assetRef2video', degraded: false, trace: ['assetRef2video'] },
        output,
        prompt,
        keyframesUsed: [],
        completedStoryboardIds: shots.map((s) => s.id),
        assetRefs: refs,
      }
    } catch (e: any) {
      aiLogger.error('video 调用失败（assetRef 片段级）', {
        callType: 'video' as const,
        mode: 'assetRef2video',
        segmentId: seg.id,
        userPrompt: prompt,
        referenceImages: [refPath],
        durationMs: Date.now() - t0,
        error: e?.message ?? String(e),
      })
      await this.segmentRepo.update(seg.id, {
        status: 'error',
        error: e?.message ?? String(e),
      })
      throw e
    }
  }

  /**
   * R4：首镜头 end 帧缺失/无图时自动补生成（完整生成+机器校验+重拍闭环在
   * KeyframeGenerationService 内部）。补生成失败仅 warn——invokeGeneration 会按
   * 既有逻辑降级 image2video（单锚，有中段漂移风险）。
   */
  private async tryEnsureEndKeyframe(storyboardId: string): Promise<void> {
    try {
      const kfs = await this.keyframeRepo.listByStoryboard(storyboardId)
      const endKf = kfs.find((k) => k.frameRole === 'end')
      if (endKf && (await this.resolveKeyframeImagePath(endKf))) return // end 有图，不用补

      const sb = await this.ds
        .getRepository(StoryboardEntity)
        .findOne({ where: { id: storyboardId } })
      const keyframeCount = Math.max(1, sb?.keyframeCount ?? 3)
      if (keyframeCount < 2) return // 单帧分镜没有 end 概念

      const kfSvc = new KeyframeGenerationService(this.ds)
      if (endKf) {
        // 有空行（ensureEmptyKeyframes 建的占位）：走重生成复用该行
        await kfSvc.regenerateKeyframe({ keyframeId: endKf.id })
      } else {
        await kfSvc.generateKeyframeAtIndex({
          storyboardId,
          frameIndex: keyframeCount - 1,
        })
      }
      console.log(`[segment-video] R4: 首镜头 end 帧自动补生成成功（storyboard=${storyboardId}）`)
    } catch (e) {
      console.warn(
        `[segment-video] R4: end 帧补生成失败，降级 i2v（单锚漂移风险，storyboard=${storyboardId}）:`,
        e,
      )
    }
  }

  private async invokeGeneration(
    seg: EpVideoSegment,
    shots: Array<{ id: string }>,
    opts: {
      prompt: string
      durationSec: number
      width: number
      height: number
      forceMode?: VideoMode
      quality?: 'high' | 'low'
      steps?: number
    },
  ): Promise<{ match: VideoModeMatch; output: VideoSegmentOutput; keyframesUsed: KeyframeInput[] }> {
    // 首尾帧参考（O1）：首镜头的 frame_role=start + end 各取一张（按 timePercent 排：start 前 end 后）。
    // end 帧无图/不存在 → 只剩首帧 1 张 → pickVideoMode 自动落 image2video。
    const firstShotKfs = await this.keyframeRepo.listByStoryboard(shots[0].id)
    const candidateKfs: KeyframeInput[] = []
    for (const kf of pickStartEndKeyframes(firstShotKfs)) {
      const imagePath = await this.resolveKeyframeImagePath(kf)
      if (imagePath) candidateKfs.push({ imagePath, timePercent: kf.timePercent })
    }

    const match: VideoModeMatch = opts.forceMode
      ? { mode: opts.forceMode, degraded: false, trace: [opts.forceMode] }
      : pickVideoMode(candidateKfs.length, this.adapter.capabilities)

    if (!match.mode) {
      throw new Error(
        `当前 video provider 无法生成视频：keyframeCount=${candidateKfs.length}，` +
          `capabilities=${JSON.stringify(this.adapter.capabilities)}`,
      )
    }

    // O1：首尾两帧 refs → keyframes2video；仅首帧 → image2video；text2video 不带参考图
    const keyframesUsed =
      match.mode === 'keyframes2video'
        ? clampKeyframesToCapability(candidateKfs, this.adapter.capabilities)
        : match.mode === 'image2video'
          ? candidateKfs.slice(0, 1)
          : []

    const { createLogger } = await import('@core/utils/logger')
    const aiLogger = createLogger('ai-call')
    const t0 = Date.now()
    const logCommon = {
      callType: 'video' as const,
      mode: match.mode,
      segmentId: seg.id,
      shotCount: seg.shotCount,
      userPrompt: opts.prompt,
      referenceImages: keyframesUsed.map(k => k.imagePath),
      size: `${opts.width}x${opts.height}`,
      durationSec: opts.durationSec,
      quality: opts.quality,
      steps: opts.steps,
    }

    let output: VideoSegmentOutput
    // H5 崩溃恢复：异步任务拿到 taskId 立即落库 provider_task_id（轮询可能持续
    // 30~45 分钟，期间进程崩溃后启动恢复凭 taskId 回网关查终态、避免算力白费）
    const onTaskId = async (taskId: string) => {
      await this.segmentRepo.update(seg.id, { providerTaskId: taskId })
    }
    try {
      if (match.mode === 'text2video') {
        if (!this.adapter.textToVideo) {
          throw new Error('Provider 声明支持 text2video 但未实现 textToVideo 方法')
        }
        output = await this.adapter.textToVideo({
          prompt: opts.prompt,
          durationSec: opts.durationSec,
          width: opts.width,
          height: opts.height,
          quality: opts.quality,
          steps: opts.steps,
          onTaskId,
        })
      } else if (match.mode === 'image2video') {
        if (!this.adapter.imageToVideo) {
          throw new Error('Provider 声明支持 image2video 但未实现 imageToVideo 方法')
        }
        const firstFrame = keyframesUsed[0]
        if (!firstFrame) throw new Error('image2video 需要首帧参考图（首镜头无可用关键帧）')
        output = await this.adapter.imageToVideo({
          imagePath: firstFrame.imagePath,
          prompt: opts.prompt,
          durationSec: opts.durationSec,
          width: opts.width,
          height: opts.height,
          quality: opts.quality,
          steps: opts.steps,
          onTaskId,
        })
      } else {
        // keyframes2video：首尾两帧参考（O1）
        if (!this.adapter.keyframesToVideo) {
          throw new Error('Provider 声明支持 keyframes2video 但未实现 keyframesToVideo 方法')
        }
        if (keyframesUsed.length < 2) {
          throw new Error('keyframes2video 需要首尾两帧关键帧（首镜头 end 帧缺图）')
        }
        output = await this.adapter.keyframesToVideo({
          keyframes: keyframesUsed,
          prompt: opts.prompt,
          durationSec: opts.durationSec,
          width: opts.width,
          height: opts.height,
          quality: opts.quality,
          steps: opts.steps,
          onTaskId,
        })
      }
    } catch (e: any) {
      aiLogger.error('video 调用失败（片段级）', {
        ...logCommon,
        durationMs: Date.now() - t0,
        error: e?.message ?? String(e),
      })
      throw e
    }
    aiLogger.info('video 调用完成（片段级）', {
      ...logCommon,
      response: output.videoPath,
      durationMs: Date.now() - t0,
    })
    return { match, output, keyframesUsed }
  }

  /** keyframe 的 image_asset_id → image_assets.imagePath */
  private async resolveKeyframeImagePath(
    kf: StoryboardKeyframe,
  ): Promise<string | null> {
    if (!kf.imageAssetId) return null
    const ia = await this.imageAssetRepo.getById(kf.imageAssetId)
    return ia?.imagePath ?? null
  }
}
