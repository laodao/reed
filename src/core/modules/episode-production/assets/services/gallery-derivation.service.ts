/**
 * 图谱派生工作流（spec §3.5）
 * @module modules/episode-production/assets/services/gallery-derivation
 *
 * 以主图作 reference image 生成 view/expression/outfit/pose 等派生图。
 * 本 service 只负责"请求构造 + 提交给 image API + 写回 asset_image"的编排逻辑，
 * 底层图像生成通过依赖注入的 ImageGenerator 抽象接口完成，
 * 与具体 image.service.ts 实现解耦——便于测试 mock 和后续切换 provider。
 */
import type {
  AssetImageService,
  AssetType,
  AssetImageCategory,
} from './asset-image.service'
import type { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

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
  }): Promise<{ imagePath: string; thumbnailPath: string | null }>
}

/** 单张派生入参 */
export interface DeriveSingleInput {
  assetType: AssetType
  assetId: string
  /** 派生图所属 category：'view' / 'expression' / 'outfit' / 'pose' 等（非 'main'） */
  category: AssetImageCategory
  /** 派生图标签（同 category 内唯一，作为去重 key） */
  label: string
  /** 额外 prompt 文本（不传则自动用 `${category} · ${label}`） */
  additionalPrompt?: string
  negativePrompt?: string
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
  constructor(
    private readonly imageSvc: AssetImageService,
    private readonly imageGen: ImageGenerator,
  ) {}

  /**
   * 派生单张图：
   * 1. 取主图（无则抛错）
   * 2. 调 imageGen 生成新图（参考主图）
   * 3. 计算 sortOrder = 现有同 category 张数（追加在末尾）
   * 4. 写入 asset_image 表，derivedFromImageId 链回主图
   */
  async deriveSingle(input: DeriveSingleInput): Promise<AssetImageEntity> {
    const main = await this.imageSvc.getMainImage(
      input.assetType,
      input.assetId,
    )
    if (!main) {
      throw new Error(
        `无法派生：${input.assetType}/${input.assetId} 没有主图`,
      )
    }

    const prompt = input.additionalPrompt ?? `${input.category} · ${input.label}`
    const result = await this.imageGen.generate({
      referenceImagePaths: [main.imagePath],
      prompt,
      negativePrompt: input.negativePrompt,
      label: input.label,
    })

    const existing = await this.imageSvc.listByCategory(
      input.assetType,
      input.assetId,
      input.category,
    )
    const sortOrder = existing.length

    return await this.imageSvc.addImage({
      assetType: input.assetType,
      assetId: input.assetId,
      category: input.category,
      label: input.label,
      imagePath: result.imagePath,
      thumbnailPath: result.thumbnailPath ?? undefined,
      isMain: false,
      derivedFromImageId: main.id,
      prompt: input.additionalPrompt ?? undefined,
      negativePrompt: input.negativePrompt ?? undefined,
      sortOrder,
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
