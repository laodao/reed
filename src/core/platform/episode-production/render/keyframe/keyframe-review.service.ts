/**
 * 关键帧一致性校验 service（2026-09-19 · 复盘整改）
 * @module platform/episode-production/render/keyframe/keyframe-review.service
 *
 * 背景：场次2「忘川不喝汤的人」人物漂移的根因是关键帧本身就是两张单人肖像——
 * 生成端没有任何校验，错图直接进视频。本服务在关键帧生成后（或用户手动触发）
 * 用 VLM 以"生成时实际使用的 prompt + 实际生效的参考图"为基准审核产出图：
 *   - 人物面容/发型/服饰是否与参考图为同一人
 *   - 画面是否覆盖提示词要求的关键元素（出场人物、动作、场景）
 *   - 明显穿帮（多余人物、文字乱码、肢体畸形）
 *
 * 结果落 image_assets.metadata.review（不动表结构），UI 画廊展示徽章，
 * 是否重生由用户决定（校验只给证据，不自动动作）。
 *
 * 基准取自 keyframe 行自身（prompt 列）+ image_assets.metadata.referenceImageIds
 * Effective（生成时实际生效的参考图），不重新解析场景资产——审的就是"当时发出去的东西"。
 */

import * as fs from 'fs'
import * as path from 'path'
import type { DataSource } from 'typeorm'
import { getPathProvider } from '@core/interfaces/path.interface'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import {
  StoryboardKeyframeRepository,
} from '@core/database/repositories/storyboard-keyframe.repository'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import {
  callVLMMulti,
  extractJsonFromResponse,
  parseJsonString,
} from '@core/platform/services/ai-call'

/** 单帧校验结果（落 image_assets.metadata.review 的形状） */
export interface KeyframeReview {
  /**
   * pass=一致；issues=发现不一致；error=校验本身失败（模型不可用/解析失败）；
   * skipped=审核模型非多模态/疑似纯文本模型无法识图，未执行 VLM 审核（只有机器校验结果）
   */
  status: 'pass' | 'issues' | 'error' | 'skipped'
  /** 发现的问题列表（人话描述，UI 直接展示） */
  issues: string[]
  /** 一句话总结 */
  summary: string
  /** 实际使用的评审模型 */
  model: string
  reviewedAt: string
}

/**
 * 审核模型是否具备视觉能力（2026-09-21 E2：雪麓山庄 v2 复盘）。
 *
 * 背景：项目「分镜生成」模型可配成纯文本模型（实测 qwen3.8-27b），VLM 审核
 * 只能返回"无法读取图像内容"却照样记 issues 放行。纯文本模型必须跳过审核。
 *
 * 判定：模型名关键词匹配（vl / vision / 4o / gemini / claude）；未给出模型名
 * （走 callVLM 默认兜底）时返回 false —— 生成闭环里只对有明确视觉标记的模型
 * 启用 VLM 审核，默认兜底模型是否多模态无法确证，宁可跳过也不假装审过。
 */
export function isVisionCapable(modelId: string | null | undefined): boolean {
  if (!modelId) return false
  return /vl|vision|4o|gemini|claude/i.test(modelId)
}

/** 纯文本模型审核结论的特征词：命中则视同 skipped（模型自认读不了图，结论不可信） */
const VLM_UNREADABLE_RE = /无法读取|不可识别|无法核验|无法确认/

/** 参考图上界：关键帧本体 1 张 + 至多 4 张参考图（VLM 上下文与成本约束） */
const MAX_REVIEW_IMAGES = 5

const SYSTEM_PROMPT = `你是剧集制作的一致性审核员。输入的第一张图是待审核的关键帧（AI 生成图），
后续图片是生成该帧时实际使用的参考图（角色定妆照 / 场景图 / 物品图），
用户消息里附有该帧的完整生成提示词。

你的任务：判断关键帧是否可以直接进入视频生成。

## 检查项
1. 人物一致性：关键帧中每个出场人物，与对应角色参考图是否为同一人
   （面容、发型、服饰、配饰）。没有参考图的角色，对照提示词中的文字描述。
2. 内容覆盖：提示词要求的关键元素（出场人物、核心动作、场景、关键物品）是否都在画面中，
   且**与提示词/参考图的描述相符**——不仅"在不在"，还要"像不像"
   （地点结构、物品形态与参考图或描述明显不同，同样算问题）。
3. 时代一致性：画面元素不得与提示词声明的时代背景矛盾
   （如古代/年代戏出现手表、现代建筑、电线杆、现代服饰；未来戏出现无据的当代物件）。
4. 明显穿帮：多余/缺失人物、画面内文字乱码、肢体畸形、与提示词矛盾的元素。

## 输出格式（纯 JSON，不要输出其他内容）
{
  "consistent": true 或 false,
  "issues": ["问题1", "问题2"],
  "summary": "一句话总结"
}

规则：
- consistent=false 当且仅当存在会影响观众观感的实质问题（人物不是同一人、核心元素缺失、明显穿帮）。
- 构图风格差异、细节质感等主观偏好不算问题。
- issues 逐条用人话写清"哪里不一致"（如「角色甲的服饰：参考图是白色长袍，关键帧是红色短裙」）。
- 无问题时 issues 为空数组。`

/** 读图文件为 data URL；失败返回 null（该校验降级为无图纯文字对照，不中断） */
function readImageAsDataUrl(relativeOrAbsPath: string): string | null {
  try {
    // 绝对路径直接用；相对路径才需要 pathProvider（单测环境可能未初始化）
    const abs = path.isAbsolute(relativeOrAbsPath)
      ? relativeOrAbsPath
      : path.join(getPathProvider().getDataPath(), relativeOrAbsPath)
    if (!fs.existsSync(abs)) return null
    const buf = fs.readFileSync(abs)
    const ext = path.extname(abs).toLowerCase().replace(/^\./, '') || 'png'
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/png'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export class KeyframeReviewService {
  private readonly keyframeRepo: StoryboardKeyframeRepository
  private readonly imageAssetRepo: ImageAssetRepository

  constructor(private readonly ds: DataSource) {
    this.keyframeRepo = new StoryboardKeyframeRepository(ds)
    this.imageAssetRepo = new ImageAssetRepository(ds)
  }

  /** 校验单帧并落库（image_assets.metadata.review） */
  async reviewKeyframe(
    keyframeId: string,
    opts?: { providerConfigId?: string; modelId?: string },
  ): Promise<KeyframeReview> {
    const kf = await this.keyframeRepo.getById(keyframeId)
    if (!kf) throw new Error(`Keyframe not found: ${keyframeId}`)
    if (!kf.imageAssetId) throw new Error('该关键帧还没有生成图片，无法校验')
    const ia = await this.imageAssetRepo.getById(kf.imageAssetId)
    if (!ia?.imagePath) throw new Error('关键帧图片资产缺失，无法校验')

    // 实际生效参考图优先（能力截断后的真实输入）；老数据没有该字段时回退全量选图
    const meta = (ia.metadata ?? {}) as Record<string, unknown>
    const refIds =
      (Array.isArray(meta.referenceImageIdsEffective) && meta.referenceImageIdsEffective.length > 0
        ? meta.referenceImageIdsEffective
        : Array.isArray(meta.referenceImageIds)
          ? meta.referenceImageIds
          : []) as string[]

    const review = await this.reviewGeneratedImage({
      imagePath: ia.imagePath,
      prompt: kf.prompt,
      referenceImageIds: refIds,
      storyboardId: kf.storyboardId,
      providerConfigId: opts?.providerConfigId,
      modelId: opts?.modelId,
    })

    await this.imageAssetRepo.update(ia.id, {
      metadata: { ...meta, review } as any,
    })
    return review
  }

  /**
   * 审核一张已生成图（不落库）。
   *
   * 供生成闭环（keyframe-generation 重拍循环）内嵌调用——彼时 image_assets / keyframe
   * 行尚未落库，只能按图片 + prompt + 生效参考图审核。reviewKeyframe 是本方法的
   * DB 装配 + 落库包装。
   *
   * E2（2026-09-21）：解析出的审核模型非多模态（isVisionCapable=false）时直接返回
   * skipped，不发 VLM 调用——纯文本模型的"审核结论"不可信（雪麓山庄 v2 根因）。
   * 未解析到模型（走 callVLM 默认兜底）时保持旧行为照常调用。
   */
  async reviewGeneratedImage(input: {
    imagePath: string
    prompt: string | null
    referenceImageIds: string[]
    /** 传了则按项目「分镜生成」模型解析审核模型（opts 显式指定优先） */
    storyboardId?: string
    providerConfigId?: string
    modelId?: string
  }): Promise<KeyframeReview> {
    // 模型解析序：调用方显式指定 > 项目「分镜生成」模型（常为 VL 模型）> callVLM 默认兜底
    const projectModel = input.modelId
      ? null
      : input.storyboardId
        ? await this.resolveProjectStoryboardModel(input.storyboardId)
        : null
    const providerConfigId = input.providerConfigId ?? projectModel?.providerConfigId
    const modelId = input.modelId ?? projectModel?.modelId

    if (modelId && !isVisionCapable(modelId)) {
      return {
        status: 'skipped',
        issues: [],
        summary: `审核模型 ${modelId} 非多模态，仅机器校验`,
        model: modelId,
        reviewedAt: new Date().toISOString(),
      }
    }

    const kfImageUrl = readImageAsDataUrl(input.imagePath)
    if (!kfImageUrl) throw new Error(`关键帧图片文件不可读：${input.imagePath}`)

    const refIds = input.referenceImageIds
    const imageUrls: string[] = [kfImageUrl]
    if (refIds.length > 0) {
      const rows = await this.ds
        .getRepository(AssetImageEntity)
        .createQueryBuilder('ai')
        .where('ai.id IN (:...ids)', { ids: refIds })
        .getMany()
      for (const row of rows) {
        if (imageUrls.length >= MAX_REVIEW_IMAGES) break
        const url = row.imagePath ? readImageAsDataUrl(row.imagePath) : null
        if (url) imageUrls.push(url)
      }
    }

    const userPrompt =
      `【该帧生成提示词】\n${input.prompt ?? '(无记录)'}\n\n` +
      `【图片说明】第 1 张 = 待审核关键帧；其余 ${imageUrls.length - 1} 张 = 生成时实际使用的参考图` +
      `${refIds.length > 0 && imageUrls.length - 1 < refIds.length ? `（注意：${refIds.length - (imageUrls.length - 1)} 张参考图读取失败未附上）` : ''}。\n` +
      `请按 system 要求输出 JSON。`

    let review: KeyframeReview
    try {
      const raw = await callVLMMulti(userPrompt, imageUrls, SYSTEM_PROMPT, 2048, providerConfigId, modelId, {
        temperature: 0.1,
      })
      review = this.parseReview(raw, modelId ?? 'default')
    } catch (e: any) {
      // 校验失败不阻断制作流程：落 error 状态让 UI 显示"校验失败"，用户可重试
      review = {
        status: 'error',
        issues: [e?.message ?? String(e)],
        summary: '校验调用失败',
        model: modelId ?? 'default',
        reviewedAt: new Date().toISOString(),
      }
    }
    return review
  }

  /** 校验一个分镜的全部已出图关键帧（串行，单帧失败不中断其余） */
  async reviewStoryboardKeyframes(
    storyboardId: string,
    opts?: { providerConfigId?: string; modelId?: string },
  ): Promise<Array<{ keyframeId: string; review: KeyframeReview | null; error?: string }>> {
    const keyframes = await this.keyframeRepo.listByStoryboard(storyboardId)
    const out: Array<{ keyframeId: string; review: KeyframeReview | null; error?: string }> = []
    for (const kf of keyframes) {
      if (!kf.imageAssetId) {
        out.push({ keyframeId: kf.id, review: null, error: '未生成图片' })
        continue
      }
      try {
        const review = await this.reviewKeyframe(kf.id, opts)
        out.push({ keyframeId: kf.id, review })
      } catch (e: any) {
        out.push({ keyframeId: kf.id, review: null, error: e?.message ?? String(e) })
      }
    }
    return out
  }

  /** 解析 VLM 输出 → KeyframeReview；JSON 坏/缺字段 → error 态（不假装通过） */
  private parseReview(raw: string, model: string): KeyframeReview {
    let parsed: any
    try {
      parsed = extractJsonFromResponse(raw)
    } catch {
      try {
        parsed = parseJsonString(raw)
      } catch {
        return {
          status: 'error',
          issues: ['VLM 输出无法解析为 JSON'],
          summary: raw.slice(0, 200),
          model,
          reviewedAt: new Date().toISOString(),
        }
      }
    }
    const issues = Array.isArray(parsed?.issues)
      ? parsed.issues.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim())
      : []
    const summary = typeof parsed?.summary === 'string' ? parsed.summary : ''
    // E2：审核结论自认"无法读取图像/无法核验"（纯文本模型典型输出）→ 视同 skipped，
    // 不能拿不可信的结论去拦/放关键帧（雪麓山庄 v2：text 模型全发 issues 仍放行）
    if (VLM_UNREADABLE_RE.test(`${summary} ${issues.join(' ')}`)) {
      return {
        status: 'skipped',
        issues: [],
        summary: `审核模型疑似无法识图，按跳过处理：${summary}`.slice(0, 300),
        model,
        reviewedAt: new Date().toISOString(),
      }
    }
    const consistent = parsed?.consistent === true
    return {
      status: consistent && issues.length === 0 ? 'pass' : 'issues',
      issues,
      summary,
      model,
      reviewedAt: new Date().toISOString(),
    }
  }

  /** 项目「分镜生成」模型解析（生成闭环判断是否启用 VLM 审核用） */
  async resolveReviewModelForStoryboard(
    storyboardId: string,
  ): Promise<{ providerConfigId: string; modelId: string } | null> {
    return this.resolveProjectStoryboardModel(storyboardId)
  }

  /** keyframe → storyboard → scene → episode → project，取 config.storyboardModel */
  private async resolveProjectStoryboardModel(
    storyboardId: string,
  ): Promise<{ providerConfigId: string; modelId: string } | null> {
    try {
      const sb = await this.ds.getRepository(StoryboardEntity).findOne({ where: { id: storyboardId } })
      if (!sb) return null
      const scene = await this.ds.getRepository(SceneScriptEntity).findOne({ where: { id: sb.sceneScriptId } })
      if (!scene) return null
      const epScript = await this.ds
        .getRepository(EpisodeScriptEntity)
        .findOne({ where: { id: scene.episodeScriptId } })
      if (!epScript) return null
      const ep = await this.ds
        .getRepository(VideoEpisodeEntity)
        .findOne({ where: { id: (epScript as any).episodeId } })
      const projectId = (ep as any)?.projectId
      if (!projectId) return null
      const project = await this.ds
        .getRepository(VideoProjectEntity)
        .findOne({ where: { id: projectId } })
      const sm = (project?.config as {
        storyboardModel?: { providerConfigId?: string; modelId?: string }
      } | null | undefined)?.storyboardModel
      return sm?.providerConfigId && sm?.modelId
        ? { providerConfigId: sm.providerConfigId, modelId: sm.modelId }
        : null
    } catch {
      return null
    }
  }
}
