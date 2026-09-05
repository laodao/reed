/**
 * 引用导入服务（spec §3.11）
 * @module modules/episode-production/assets/services/asset-import
 *
 * 把外部已有的图片来源（立绘变体 portrait_variants / 通用图库 images）
 * 引用到统一图谱 asset_image 表里。
 *
 * 仅"引用 imagePath"，不做物理文件复制；不写 derivedFromImageId
 * （这是导入，不是派生 —— 派生请见 GalleryDerivationService）。
 *
 * 所有 public 方法签名稳定，IPC / Web 路由层（P3a Task 9）会包装本服务。
 */
import type { DataSource, Repository } from 'typeorm'
import { PortraitVariantEntity } from '@core/database/entities/portrait-variant.entity'
import { ImageEntity } from '@core/database/entities/image.entity'
import type { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import {
  AssetImageService,
  type AssetType,
  type AssetImageCategory,
} from './asset-image.service'

/** 从立绘变体导入到 asset_image 的入参 */
export interface ImportFromPortraitVariantInput {
  variantId: string
  targetAssetType: AssetType
  targetAssetId: string
  asCategory: AssetImageCategory
  asLabel?: string
  asMain?: boolean
}

/** 从 images 表导入到 asset_image 的入参 */
export interface ImportFromImageInput {
  imageId: string
  targetAssetType: AssetType
  targetAssetId: string
  asCategory: AssetImageCategory
  asLabel?: string
  asMain?: boolean
}

/**
 * 引用导入服务。
 *
 * 通过 AssetImageService 写入统一图谱，不直接 touch typeorm 写 asset_image 表。
 * 仅在读取来源（portrait_variants / images）时直接用 typeorm Repository。
 */
export class AssetImportService {
  constructor(
    private readonly ds: DataSource,
    private readonly imageSvc: AssetImageService,
  ) {}

  private get variantRepo(): Repository<PortraitVariantEntity> {
    return this.ds.getRepository(PortraitVariantEntity)
  }

  private get imageRepo(): Repository<ImageEntity> {
    return this.ds.getRepository(ImageEntity)
  }

  /**
   * 从立绘变体（portrait_variants）导入一张图到目标 asset。
   *
   * - label fallback：未传 asLabel 时用 variant.angle（NOT NULL，恒有值）
   * - imagePath：直接复用 variant.imagePath（不复制文件）
   * - 不写 derivedFromImageId
   */
  async importFromPortraitVariant(
    input: ImportFromPortraitVariantInput,
  ): Promise<AssetImageEntity> {
    const v = await this.variantRepo.findOne({ where: { id: input.variantId } })
    if (!v) {
      throw new Error(`PortraitVariant not found: ${input.variantId}`)
    }

    return await this.writeImported(
      // 未显式指定 slot label 时回退到变体角度（历史行为；对话框调用方对非 main slot 都传了 label）
      { ...input, asLabel: input.asLabel ?? v.angle },
      v.imagePath,
      v.prompt ?? undefined,
    )
  }

  /**
   * 从 images 表导入一张图到目标 asset。
   *
   * - imagePath：取 image.filePath（注意 entity 列名是 file_path / filePath，不是 imagePath）
   * - prompt：若 image.prompt 存在则一并带过去
   * - 不写 derivedFromImageId
   */
  async importFromImage(
    input: ImportFromImageInput,
  ): Promise<AssetImageEntity> {
    const img = await this.imageRepo.findOne({ where: { id: input.imageId } })
    if (!img) {
      throw new Error(`Image not found: ${input.imageId}`)
    }

    return await this.writeImported(
      input,
      img.filePath,
      img.prompt ?? undefined,
    )
  }

  /**
   * 统一写入：
   * - asMain=true 时走「addImage(isMain:false) + setAsMain」范式（对齐 main-image-upload），
   *   setAsMain 会把同资产旧 isMain=1 降级，避免产生双主图（is_main 唯一性不变量）。
   * - asLabel 有值时按 (assetType, assetId, label) 查重：已存在行（占位行或真实图）复用更新，
   *   避免"关联人像对已占用 slot 重复导入"产生同 label 多行遮蔽真实图。
   */
  private async writeImported(
    input: ImportFromPortraitVariantInput | ImportFromImageInput,
    imagePath: string,
    prompt: string | undefined,
  ): Promise<AssetImageEntity> {
    const label = input.asLabel ?? null

    // 同 slot 已有行 → 复用更新（占位行 imagePath='' 直接回填；真实图则覆盖路径）
    if (label) {
      const all = await this.imageSvc.listByAsset(
        input.targetAssetType,
        input.targetAssetId,
      )
      const existing = all.find((r) => r.label === label)
      if (existing) {
        await this.imageSvc.updateImage(existing.id, {
          imagePath,
          prompt: prompt ?? null,
        })
        if (input.asMain) await this.imageSvc.setAsMain(existing.id)
        return (await this.imageSvc.getById(existing.id)) as AssetImageEntity
      }
    }

    const newImage = await this.imageSvc.addImage({
      assetType: input.targetAssetType,
      assetId: input.targetAssetId,
      category: input.asCategory,
      label,
      imagePath,
      prompt,
      // 先落 isMain=false，asMain=true 时由 setAsMain 统一升主图（自动降级旧主图）
      isMain: false,
    })
    if (input.asMain) await this.imageSvc.setAsMain(newImage.id)
    // setAsMain 后 isMain 已升主图，重读返回（与上方 label 复用分支一致），避免返回过期的 isMain=false
    return (input.asMain
      ? ((await this.imageSvc.getById(newImage.id)) as AssetImageEntity)
      : newImage)
  }
}
