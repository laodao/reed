/**
 * asset_image 表 Repository
 * @module database/repositories/asset-image.repository
 * @description 基于 BaseRepository（多租户 user_id scope 自动生效）。
 *              本 Repository 仅暴露最基础的 typeorm CRUD；高层业务逻辑统一封装在
 *              `AssetImageService`（src/core/modules/episode-production/assets/services/asset-image.service.ts）。
 */

import type { DataSource } from 'typeorm'
import { AssetImageEntity } from '../entities/episode-production/asset-image.entity'
import { BaseRepository } from '../base-repository'

export class AssetImageRepository extends BaseRepository<
  AssetImageEntity,
  AssetImageEntity
> {
  constructor(dataSource: DataSource) {
    super(dataSource, AssetImageEntity)
  }

  /** Entity 直接作为 DTO（结构稳定且仅供主进程内部使用） */
  protected toDto(entity: AssetImageEntity): AssetImageEntity {
    return entity
  }

  /** 列出某 asset 的全部图（按 sort_order 升序） */
  async listByAsset(
    assetType: AssetImageEntity['assetType'],
    assetId: string,
  ): Promise<AssetImageEntity[]> {
    return this.scoped.find({
      where: { assetType, assetId } as any,
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    })
  }

  /** 取该 asset 的主图（is_main=1） */
  async getMainImage(
    assetType: AssetImageEntity['assetType'],
    assetId: string,
  ): Promise<AssetImageEntity | null> {
    return this.scoped.findOne({ assetType, assetId, isMain: 1 } as any)
  }

  /** 删除某 asset 下全部图（asset 本体被删除时调用） */
  async deleteByAsset(
    assetType: AssetImageEntity['assetType'],
    assetId: string,
  ): Promise<number> {
    return this.scoped.delete({ assetType, assetId } as any)
  }
}
