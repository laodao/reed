/**
 * 图谱派生工作流（spec §3.5）
 * @module platform/episode-production/assets/services/gallery-derivation
 *
 * 以主图作 reference image 生成 view/expression/outfit/pose 等派生图。
 * 本 service 只负责"请求构造 + 提交给 image API + 写回 asset_image"的编排逻辑，
 * 底层图像生成通过依赖注入的 ImageGenerator 抽象接口完成，
 * 与具体 image.service.ts 实现解耦——便于测试 mock 和后续切换 provider。
 */
import type { DataSource } from 'typeorm'
import type {
  AssetImageService,
  AssetType,
  AssetImageCategory,
} from './asset-image.service'
import type { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import {
  appendCharacterConstraints,
  framingForCategory,
  mergeCharacterNegative,
  appendCharacterIdentityPreservation,
  mergeCharacterIdentityNegative,
} from '@core/platform/episode-production/assets/prompts/character-constraints'
import {
  appendAngleLightingLock,
  mergeAngleLightingNegative,
  appendLocationNoHumanConstraint,
  mergeLocationNoHumanNegative,
  appendVariantDimensionLock,
  mergeVariantDimensionLockNegative,
} from '@core/platform/episode-production/assets/prompts/location-constraints'
import {
  appendItemConstraints,
  mergeItemNegative,
  appendItemIdentityPreservation,
  mergeItemIdentityNegative,
} from '@core/platform/episode-production/assets/prompts/item-constraints'
import {
  buildAssetIdentityPrompt,
  prependIdentity,
  type StoryBackground,
} from '@core/platform/episode-production/assets/prompts/asset-identity-prompt'
import { viewHintForLabel } from '@core/platform/episode-production/assets/prompts/character-view-hints'
import { fallbackToReferenceCapableModel } from './image-provider-adapter'
import { CharacterAssetService } from './character-asset.service'
import { LocationAssetService } from './location-asset.service'
import { ItemAssetService } from './item-asset.service'

/**
 * 抽象图像生成器接口（依赖注入）。
 *
 * 实现方负责：根据参考图 + prompt 生成新图，落地为本地或远端文件路径，
 * 并返回主图路径与可选缩略图路径。
 */
export interface ImageGenerator {
  generate(opts: {
    referenceImagePaths: string[]
    prompt: string
    negativePrompt?: string
    label: string
    /** 输出尺寸（可选；不传由实现方按各自默认决定） */
    width?: number
    height?: number
    /**
     * P-B：显式指定图像 provider/模型（资产图生成器下拉选择）。
     * 不传 → 实现方自动挑启用 provider 的第一个 image 模型（pickImageModel）。
     */
    providerConfigId?: string
    modelId?: string
  }): Promise<{
    imagePath: string
    thumbnailPath: string | null
    /**
     * 实际解析使用的 provider/模型（2026-09-19）：实现方自动挑模型时调用方无法预知，
     * 返回给调用方落库（image_assets.metadata.resolvedModel）让"这张图是哪个模型画的"可查。
     */
    resolvedModel?: { providerConfigId: string; modelId: string }
    /**
     * 实际生效的参考图路径（按模型 maxReferenceImages 能力截断后）。
     * 缺省/与传入相同表示全部生效；被截断时调用方应把差异暴露给用户（生效参考图标记）。
     */
    effectiveReferencePaths?: string[]
  }>
}

/** 单张派生入参 */
export interface DeriveSingleInput {
  assetType: AssetType
  assetId: string
  /** 派生图所属 category：'view' / 'expression' / 'outfit' / 'pose' / 'variant' 等（非 'main'） */
  category: AssetImageCategory
  /** 派生图标签（同 category 内唯一，作为去重 key） */
  label: string
  /** 额外 prompt 文本（不传则自动用 `${category} · ${label}`） */
  additionalPrompt?: string
  negativePrompt?: string
  /**
   * 基图 ID（spec 2026-05-09 多主图模型）：用户在派生 dialog 选定的某张主图。
   * 不传时回退到默认主图（is_main=1）— 兼容老 character / item 单主图调用方。
   */
  baseImageId?: string
  /**
   * 多基图 ID 列表（spec 2026-05-09 ep-redesign §3.2 B6）：
   * 让 provider 多 ref（万相 1-4 张 / Seedream 多张 / 可灵 element_list）一次喂多张参考。
   * - 优先级高于 baseImageId（同时传时用 baseImageIds）
   * - 空数组 → fallback 到默认主图
   * - 落库时 derivedFromImageId = baseImageIds[0]（保留单值，向后兼容现有 schema）
   * - 全部 baseImageIds 都校验属于该资产 binding；任一非法 → 抛错
   */
  baseImageIds?: string[]
  /** 派生图 metadata（angle/time/weather/...），评分系统据此命中场景维度 */
  metadata?: Record<string, unknown>
  /**
   * 故事背景（可选 · 来自调用方当前 episode 上下文）。
   * 派生时附加到 identity prompt 末尾，让派生图也带年代 / 地域信息。
   * service 内部加载 effective 但 storyBackground 在 binding 之外（episode 级），所以需上游传入。
   */
  storyBackground?: StoryBackground | null
}

/** 批量派生入参 */
export interface DeriveBatchInput {
  assetType: AssetType
  assetId: string
  category: AssetImageCategory
  /** 待派生 label 列表；已存在的 label 会被自动跳过 */
  labels: string[]
}

/**
 * 派生图工作流服务。
 *
 * 用法：
 * ```ts
 * const svc = new GalleryDerivationService(imageSvc, imageGen)
 * await svc.deriveSingle({ assetType: 'character', assetId, category: 'view', label: '3q_left' })
 * await svc.deriveBatch({ assetType: 'character', assetId, category: 'view', labels: [...] })
 * ```
 */
export class GalleryDerivationService {
  /**
   * 注入 ds（spec 2026-05-09 review 修复）— 让 deriveSingle 可以加载 effective 数据
   * 自动注入资产身份 prompt（name / description / styleAnchors / 故事背景），
   * 解决"派生图丢失身份信息"问题。
   */
  constructor(
    private readonly imageSvc: AssetImageService,
    private readonly imageGen: ImageGenerator,
    private readonly ds?: DataSource,
  ) {}

  /** 按 assetType 加载 effective 数据；ds 未注入时返回 null（向后兼容） */
  private async loadEffective(
    assetType: AssetType,
    assetId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.ds) return null
    try {
      if (assetType === 'character') {
        return (await new CharacterAssetService(this.ds).getEffectiveData(
          assetId,
        )) as unknown as Record<string, unknown>
      }
      if (assetType === 'location') {
        return (await new LocationAssetService(this.ds, this.imageSvc).getEffectiveData(
          assetId,
        )) as unknown as Record<string, unknown>
      }
      if (assetType === 'item') {
        return (await new ItemAssetService(this.ds).getEffectiveData(
          assetId,
        )) as unknown as Record<string, unknown>
      }
      return null
    } catch {
      // 加载失败不致命；继续走 label-only fallback
      return null
    }
  }

  /**
   * F1：派生图钉项目「画面生成」模型（config.imageModel），与主图 / 三视图同源，
   * 避免自动挑到不同源模型导致同一资产主图与派生图风格分叉。
   * 解析序与 main-image-generator.resolveProjectImageModel 一致：
   * 资产 binding → projectId → project.config.imageModel。
   * ds 未注入 / 资产无 projectId（全局 preset）/ 未配置 → null（走 imageGen 自动挑，既有行为）；
   * 解析异常 → warn 留痕后回退自动挑。
   */
  private async resolveProjectImageModel(
    assetType: AssetType,
    assetId: string,
  ): Promise<{ providerConfigId: string; modelId: string } | null> {
    if (!this.ds) return null
    try {
      const bindingRepo =
        assetType === 'character'
          ? this.ds.getRepository(CharacterBindingEntity)
          : assetType === 'location'
            ? this.ds.getRepository(LocationBindingEntity)
            : this.ds.getRepository(ItemBindingEntity)
      const binding = await bindingRepo.findOne({ where: { id: assetId } as any })
      const projectId = (binding as any)?.projectId as string | null | undefined
      if (!projectId) return null
      const project = await this.ds
        .getRepository(VideoProjectEntity)
        .findOne({ where: { id: projectId } })
      const im = (project?.config as { imageModel?: { providerConfigId?: string; modelId?: string } } | null | undefined)
        ?.imageModel
      return im?.providerConfigId && im?.modelId
        ? { providerConfigId: im.providerConfigId, modelId: im.modelId }
        : null
    } catch (e) {
      console.warn('[GalleryDerivationService] 项目画面模型解析失败，回退自动挑模型:', e)
      return null
    }
  }

  /**
   * 派生单张图：
   * 1. 取基图（spec 2026-05-09：input.baseImageId 优先；不传时回退到默认主图）
   * 2. 调 imageGen 生成新图（参考基图）
   * 3. 计算 sortOrder = 现有同 category 张数（追加在末尾）
   * 4. 写入 asset_image 表，derivedFromImageId 链回基图
   */
  async deriveSingle(input: DeriveSingleInput): Promise<AssetImageEntity> {
    // spec 2026-05-09 ep-redesign §3.2 B6 多基图：优先级 baseImageIds (非空) > baseImageId > 默认主图
    let baseList: AssetImageEntity[] = []
    if (input.baseImageIds && input.baseImageIds.length > 0) {
      // 多基图：全部校验属于该 binding
      for (const id of input.baseImageIds) {
        const img = await this.imageSvc.getById(id)
        if (!img) {
          throw new Error(`baseImageId 不存在：${id}`)
        }
        if (img.assetType !== input.assetType || img.assetId !== input.assetId) {
          throw new Error(`baseImageId ${id} 不属于该资产 binding`)
        }
        baseList.push(img)
      }
    } else if (input.baseImageId) {
      // 单基图（向后兼容）
      const img = await this.imageSvc.getById(input.baseImageId)
      if (!img) {
        throw new Error(`baseImageId 不存在：${input.baseImageId}`)
      }
      if (img.assetType !== input.assetType || img.assetId !== input.assetId) {
        throw new Error('baseImageId 不属于该资产 binding')
      }
      baseList = [img]
    } else {
      // 兼容老 character / item 调用方：回退到默认主图（isMain=1）
      const main = await this.imageSvc.getMainImage(input.assetType, input.assetId)
      if (main) baseList = [main]
    }
    if (baseList.length === 0) {
      throw new Error(
        `无法派生：${input.assetType}/${input.assetId} 没有可用基图（主图未生成或已删除）`,
      )
    }
    // 基图必须是真实图片：imagePath='' 的占位行（仅承载待生成提示词）不能当参考，
    // 否则 readImageAsDataUrl('') 静默返回 undefined → 生成无身份参考的派生图。
    const emptyBase = baseList.find((b) => !b.imagePath)
    if (emptyBase) {
      throw new Error('无法派生：主图尚未生成（当前只有待生成提示词）。请先生成主图')
    }
    const base = baseList[0]  // 单值兼容现有 derivedFromImageId 字段

    // 角色派生：系统固定模板 —— 该 slot 的角度/景别描述（如"正面半身"）。
    // 有角度映射的 slot（main/半身/侧面/全身）忽略调用方传入的用户提示词，
    // 保证同一角色不同角度仅角度/景别变化；无映射（expression/outfit/pose）
    // 仍用调用方描述（表情/服饰需要具体描述才能生成）。
    const isCharacter = input.assetType === 'character'
    const viewHint = isCharacter ? viewHintForLabel(input.label) : null
    let prompt = viewHint
      ? viewHint.viewHint
      : (input.additionalPrompt ?? `${input.category} · ${input.label}`)
    let negativePrompt = input.negativePrompt

    /*
     * spec 2026-05-09 review 修复：
     * 派生 prompt 自动带 name / description / styleAnchors / 故事背景。
     * 让派生图不再仅靠 reference image 维持身份，而是文本侧也有强 anchor。
     */
    const eff = await this.loadEffective(input.assetType, input.assetId)
    if (eff) {
      const identity = buildAssetIdentityPrompt(
        input.assetType,
        eff,
        input.storyBackground ?? null,
      )
      prompt = prependIdentity(identity, prompt)
    }

    // 角色资产硬约束：纯色背景 / 光照均匀无阴影（帽子、首饰不约束，交用户控制）；
    // framing 按 slot 语义（半身 → upperBody；全身 → fullBody），不再按 category 一刀切。
    if (input.assetType === 'character') {
      const framing = viewHint?.framing ?? framingForCategory(input.category)
      prompt = appendCharacterConstraints(prompt, framing)
      negativePrompt = mergeCharacterNegative(negativePrompt, framing)
      // 派生场景（有 base ref）注入身份保持文本约束（face / hair / build / skin tone preservation）
      prompt = appendCharacterIdentityPreservation(prompt)
      negativePrompt = mergeCharacterIdentityNegative(negativePrompt)
    }

    // 地点变体维度锁（spec 2026-05-09 review）：
    //   - 老路径 angle_variant：保留旧光照锁（仅在迁移完成前的老数据触发）
    //   - 新路径 'variant'：按 metadata 决定锁哪些维度
    //     metadata.angle 有 → 锁 time + weather（保持光线 / 天气）
    //     metadata.time 有 → 锁 angle + weather（保持机位 / 天气）
    //     metadata.weather 有 → 锁 angle + time（保持机位 / 时间）
    //     metadata 全部空 → 不锁任何维度（用户完全自由）
    if (input.assetType === 'location' && input.category === 'angle_variant') {
      prompt = appendAngleLightingLock(prompt)
      negativePrompt = mergeAngleLightingNegative(negativePrompt)
    }
    if (input.assetType === 'location' && input.category === 'variant') {
      prompt = appendVariantDimensionLock(prompt, input.metadata)
      negativePrompt = mergeVariantDimensionLockNegative(
        negativePrompt,
        input.metadata,
      )
    }
    // 地点全域无人约束（spec §location-no-human）：
    // 所有 location 资产的派生图（angle / time / weather / pose 等所有 label）
    // 强制不出现人物，约束在此统一注入，与角度锁并存（幂等函数允许多次调用）。
    if (input.assetType === 'location') {
      prompt = appendLocationNoHumanConstraint(prompt)
      negativePrompt = mergeLocationNoHumanNegative(negativePrompt)
    }
    // item 派生硬约束 + 身份保持（spec 2026-05-09 review）：
    if (input.assetType === 'item') {
      prompt = appendItemConstraints(prompt)
      negativePrompt = mergeItemNegative(negativePrompt)
      prompt = appendItemIdentityPreservation(prompt)
      negativePrompt = mergeItemIdentityNegative(negativePrompt)
    }
    // spec 2026-05-09 ep-redesign §3.2 B6：多基图全部进 referenceImagePaths
    // F1：钉项目「画面生成」模型（与主图 / 三视图同源）；解析不到 → undefined 走自动挑
    // F1b：钉住的模型不支持参考图（如 krea2 maxReferenceImages=0）→ 回退同 provider 的 I2I 模型
    const projectImageModel = await fallbackToReferenceCapableModel(
      await this.resolveProjectImageModel(input.assetType, input.assetId),
    )
    const result = await this.imageGen.generate({
      referenceImagePaths: baseList.map((b) => b.imagePath),
      prompt,
      negativePrompt,
      label: input.label,
      providerConfigId: projectImageModel?.providerConfigId,
      modelId: projectImageModel?.modelId,
    })

    const existing = await this.imageSvc.listByCategory(
      input.assetType,
      input.assetId,
      input.category,
    )
    const sortOrder = existing.length

    // 复用同 label 的占位行（imagePath='' 的"待生成提示词"行）——否则同一 slot 会出现
    // 占位行 + 真实图两行，前端按 createdAt 先命中占位行，真实图被遮蔽显示"待生成"。
    // （与 MainImageGeneratorService.generateMain 对 main 占位行的复用逻辑对齐。）
    const allRows = await this.imageSvc.listByAsset(input.assetType, input.assetId)
    const placeholder = allRows.find(
      (r) => r.label === input.label && !r.imagePath,
    )
    if (placeholder) {
      await this.imageSvc.updateImage(placeholder.id, {
        imagePath: result.imagePath,
        thumbnailPath: result.thumbnailPath ?? undefined,
        prompt,
        negativePrompt: negativePrompt ?? undefined,
        derivedFromImageId: base.id,
        sortOrder,
      })
      return (await this.imageSvc.getById(placeholder.id)) as AssetImageEntity
    }

    return await this.imageSvc.addImage({
      assetType: input.assetType,
      assetId: input.assetId,
      category: input.category,
      label: input.label,
      imagePath: result.imagePath,
      thumbnailPath: result.thumbnailPath ?? undefined,
      isMain: false,
      derivedFromImageId: base.id,
      prompt: prompt,
      negativePrompt: negativePrompt ?? undefined,
      sortOrder,
      metadata: input.metadata,
    })
  }

  /**
   * 批量派生：
   * - 先 listByCategory 拿现有图，收集已存在 label set
   * - 遍历 labels，已存在则跳过，否则调 deriveSingle 生成
   *
   * 串行执行（不并发），保证 sortOrder 严格递增、避免对底层 image API 冲击。
   */
  async deriveBatch(input: DeriveBatchInput): Promise<void> {
    const existing = await this.imageSvc.listByCategory(
      input.assetType,
      input.assetId,
      input.category,
    )
    const existingLabels = new Set(
      existing
        .map((e) => e.label)
        .filter((l): l is string => typeof l === 'string' && l.length > 0),
    )

    for (const label of input.labels) {
      if (existingLabels.has(label)) continue
      await this.deriveSingle({
        assetType: input.assetType,
        assetId: input.assetId,
        category: input.category,
        label,
      })
    }
  }
}
