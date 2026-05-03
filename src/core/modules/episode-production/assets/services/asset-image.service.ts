/**
 * asset_image 表统一图谱 CRUD（spec §3.8）
 * @module modules/episode-production/assets/services/asset-image
 *
 * 封装 asset_image 表的通用读写操作：
 * - 按 (asset_type, asset_id) 取全部图 / 按 category 过滤
 * - 加图 / 删图 / 改图
 * - 标 main（自动把同 asset 的旧 main 降为 view）
 * - 取主图（无则 null）
 *
 * 后续所有具体资产 service（character / location / item / portrait）通过
 * 此 service 读写图谱，不直接 touch typeorm，保持业务层与 ORM 解耦。
 */

import { randomBytes } from 'crypto'
import type { DataSource, Repository } from 'typeorm'
import {
  AssetImageEntity,
  type AssetType,
  type AssetImageCategory,
} from '@core/database/entities/episode-production/asset-image.entity'

export type { AssetType, AssetImageCategory }

/** 添加一张图的入参 */
export interface AddImageInput {
  assetType: AssetType
  assetId: string
  category: AssetImageCategory
  imagePath: string
  isMain?: boolean
  label?: string
  prompt?: string
  negativePrompt?: string
  thumbnailPath?: string
  derivedFromImageId?: string
  sortOrder?: number
  /** 扩展元数据（写入时 JSON 序列化为 text 列） */
  metadata?: Record<string, unknown>
  userId?: string | null
}

/**
 * 统一图谱（asset_image）CRUD 服务。
 *
 * 不承载业务逻辑（业务规则放在 character/location/item-asset.service 等具体资产 service 中）。
 */
export class AssetImageService {
  constructor(private readonly ds: DataSource) {}

  private get repo(): Repository<AssetImageEntity> {
    return this.ds.getRepository(AssetImageEntity)
  }

  /** 生成 ai_xxxx 格式的图片 ID */
  private generateId(): string {
    return `ai_${randomBytes(8).toString('hex')}`
  }

  /**
   * 新增一张图。
   * - 自动生成 `ai_<16hex>` 格式 ID
   * - isMain=true 时只置 1，调用方负责保证同 asset 唯一性（如需切换请用 setAsMain）
   */
  async addImage(input: AddImageInput): Promise<AssetImageEntity> {
    const entity = this.repo.create({
      id: this.generateId(),
      userId: input.userId ?? null,
      assetType: input.assetType,
      assetId: input.assetId,
      category: input.category,
      label: input.label ?? null,
      prompt: input.prompt ?? null,
      negativePrompt: input.negativePrompt ?? null,
      imagePath: input.imagePath,
      thumbnailPath: input.thumbnailPath ?? null,
      isMain: input.isMain ? 1 : 0,
      derivedFromImageId: input.derivedFromImageId ?? null,
      sortOrder: input.sortOrder ?? 0,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: new Date(),
      updatedAt: null,
    })
    return await this.repo.save(entity)
  }

  /** 列出某 asset 的全部图（按 sort_order 升序，相同 sort_order 按 created_at 升序） */
  async listByAsset(
    assetType: AssetType,
    assetId: string,
  ): Promise<AssetImageEntity[]> {
    return await this.repo.find({
      where: { assetType, assetId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    })
  }

  /** 按 category 过滤同 asset 下的图 */
  async listByCategory(
    assetType: AssetType,
    assetId: string,
    category: AssetImageCategory,
  ): Promise<AssetImageEntity[]> {
    return await this.repo.find({
      where: { assetType, assetId, category },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    })
  }

  /** 取该 asset 的主图（is_main=1）；无则返回 null */
  async getMainImage(
    assetType: AssetType,
    assetId: string,
  ): Promise<AssetImageEntity | null> {
    return await this.repo.findOne({
      where: { assetType, assetId, isMain: 1 },
    })
  }

  /**
   * 把指定图设为该 asset 的主图：
   * 1. 先把同 (asset_type, asset_id) 下原有 main 改为 isMain=0 + category='view'
   * 2. 再把目标图置 isMain=1 + category='main'
   *
   * 不在事务里跑（SQLite/PG 不支持嵌套事务的兼容性问题），调用方需要事务隔离时自行包裹。
   */
  async setAsMain(imageId: string): Promise<void> {
    const target = await this.repo.findOne({ where: { id: imageId } })
    if (!target) {
      throw new Error(`AssetImage 不存在: ${imageId}`)
    }

    // 1. 把同 asset 之前的 main 全部降级为 view
    await this.repo
      .createQueryBuilder()
      .update(AssetImageEntity)
      .set({ isMain: 0, category: 'view' })
      .where(
        'asset_type = :assetType AND asset_id = :assetId AND is_main = :one AND id <> :targetId',
        {
          assetType: target.assetType,
          assetId: target.assetId,
          one: 1,
          targetId: imageId,
        },
      )
      .execute()

    // 2. 目标图升为 main
    await this.repo.update(
      { id: imageId },
      { isMain: 1, category: 'main', updatedAt: new Date() },
    )
  }

  /** 删除单张图 */
  async deleteImage(imageId: string): Promise<void> {
    await this.repo.delete({ id: imageId })
  }

  /**
   * 局部更新一张图的字段（不涉及主图切换，仅用于 label / prompt / sortOrder / metadata 等修改）。
   *
   * 主图切换请使用 `setAsMain`，避免直接传 `isMain` 破坏唯一性。
   */
  async updateImage(
    imageId: string,
    patch: Partial<
      Pick<
        AssetImageEntity,
        | 'label'
        | 'prompt'
        | 'negativePrompt'
        | 'imagePath'
        | 'thumbnailPath'
        | 'sortOrder'
        | 'metadata'
        | 'derivedFromImageId'
      >
    >,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return
    await this.repo.update(
      { id: imageId },
      { ...patch, updatedAt: new Date() },
    )
  }
}
