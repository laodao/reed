/**
 * 主图（main）生成 service
 * @module modules/episode-production/assets/services/main-image-generator
 *
 * 调底层 ImageGenerator 生成一张图作为某资产（character / location / item）的主图，
 * 落表 category='main', isMain=1。如果该资产已有主图，新主图会顶替旧主图（旧的 isMain=0）。
 *
 * 派生 service（GalleryDerivationService.deriveSingle）需要资产先有主图作参考；
 * 本 service 提供"主图入口"，与派生互补。两者共用 ImageGenerator 接口。
 *
 * 双端共用：core 包，后端 service 不直接拼前端 UI 逻辑；imageGen 由 handler / router 注入
 * 真实 ImageService 适配器（src/core/...services/image-provider-adapter.ts）。
 */

import { randomBytes } from 'crypto'
import type { Repository, DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { AssetImageService, type AssetType } from './asset-image.service'
import type { ImageGenerator } from './gallery-derivation.service'

export interface GenerateMainInput {
  assetType: AssetType
  assetId: string
  /** 完整 prompt（应由调用方从 effective data 拉名字 / 描述 / 风格拼好） */
  prompt: string
  negativePrompt?: string
  userId?: string | null
}

export class MainImageGeneratorService {
  /**
   * imageSvc 当前未直接调用（落表走 Repository.save），但保留构造参数以保持
   * 与 GalleryDerivationService / PanoramaGeneratorService 一致的注入签名，
   * 方便后续如果增加 main 图衍生 / 缩略图生成等需要 imageSvc 的能力。
   */
  constructor(
    private readonly _imageSvc: AssetImageService,
    private readonly imageGen: ImageGenerator,
    private readonly ds: DataSource,
  ) {
    void this._imageSvc
  }

  private get imageRepo(): Repository<AssetImageEntity> {
    return this.ds.getRepository(AssetImageEntity)
  }

  private generateId(): string {
    return `ai_${randomBytes(8).toString('hex')}`
  }

  /**
   * 流程：
   * 1. 调 imageGen.generate（无 referenceImagePaths：主图本身没有上游图）
   * 2. 把当前 (assetType, assetId) 已有的所有 isMain=1 行改 isMain=0
   * 3. 直接 INSERT 一行 (category='main', isMain=1)，绕开 imageSvc.addImage（其内部对 isMain
   *    重复处理已涵盖，但走 INSERT 更显式 + 与流程语义对齐）
   */
  async generateMain(input: GenerateMainInput): Promise<AssetImageEntity> {
    if (!input.prompt.trim()) {
      throw new Error('生成主图需要 prompt（请检查资产 effective 数据）')
    }

    const result = await this.imageGen.generate({
      referenceImagePaths: [],
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      label: 'main',
    })

    // 旧主图降级
    await this.imageRepo
      .createQueryBuilder()
      .update(AssetImageEntity)
      .set({ isMain: 0 })
      .where(
        'asset_type = :t AND asset_id = :id AND is_main = 1',
        { t: input.assetType, id: input.assetId },
      )
      .execute()

    // 写新主图
    const entity = this.imageRepo.create({
      id: this.generateId(),
      userId: input.userId ?? null,
      assetType: input.assetType,
      assetId: input.assetId,
      category: 'main',
      label: null,
      imagePath: result.imagePath,
      thumbnailPath: result.thumbnailPath ?? null,
      isMain: 1,
      sortOrder: 0,
      derivedFromImageId: null,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt ?? null,
      width: null,
      height: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<AssetImageEntity>)

    return await this.imageRepo.save(entity)
  }
}
