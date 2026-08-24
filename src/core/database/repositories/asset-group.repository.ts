/**
 * 资产组仓库（套图/组图）
 * @module core/database/repositories/asset-group.repository
 * @description asset_groups 表 CRUD + 成员聚合。组 = 一次流程（运行）产生的多资产集合，
 *              电商套图等场景把「主图+场景图+白底图...」归为一组，资产中心以组卡片展示。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import { AssetGroupEntity } from '../entities/asset-group.entity'
import { BaseRepository } from '../base-repository'

export interface AssetGroupRecord {
  id: string
  userId: string | null
  name: string
  category: string | null
  subCategory: string | null
  description: string | null
  coverAssetId: string | null
  sourceType: string | null
  sourceRef: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateAssetGroupInput {
  name: string
  category?: string | null
  subCategory?: string | null
  description?: string | null
  coverAssetId?: string | null
  sourceType?: string | null
  sourceRef?: string | null
}

export class AssetGroupRepository extends BaseRepository<AssetGroupEntity, AssetGroupRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, AssetGroupEntity)
  }

  private generateId(): string {
    return `ag_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  protected toDto(e: AssetGroupEntity): AssetGroupRecord {
    return {
      id: e.id,
      userId: e.userId,
      name: e.name,
      category: e.category,
      subCategory: e.subCategory,
      description: e.description,
      coverAssetId: e.coverAssetId,
      sourceType: e.sourceType,
      sourceRef: e.sourceRef,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : '',
      updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : '',
    }
  }

  async findById(id: string): Promise<AssetGroupRecord | null> {
    const e = await this.scoped.findOne({ id } as FindOptionsWhere<AssetGroupEntity>)
    return e ? this.toDto(e) : null
  }

  /** 按来源（运行）查组——同一次流程产生的组 */
  async findBySource(sourceType: string | null, sourceRef: string | null): Promise<AssetGroupRecord | null> {
    const e = await this.scoped.findOne({ sourceType, sourceRef } as FindOptionsWhere<AssetGroupEntity>)
    return e ? this.toDto(e) : null
  }

  async create(data: CreateAssetGroupInput): Promise<AssetGroupRecord> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      userId: null, // BaseRepository 注入
      name: data.name,
      category: data.category ?? null,
      subCategory: data.subCategory ?? null,
      description: data.description ?? null,
      coverAssetId: data.coverAssetId ?? null,
      sourceType: data.sourceType ?? null,
      sourceRef: data.sourceRef ?? null,
      createdAt: now,
      updatedAt: now,
    } as Partial<AssetGroupEntity>)
    return this.toDto(entity as AssetGroupEntity)
  }

  async update(id: string, patch: Partial<CreateAssetGroupInput>): Promise<AssetGroupRecord | null> {
    const partial: Partial<AssetGroupEntity> = { updatedAt: new Date() }
    if (patch.name !== undefined) partial.name = patch.name
    if (patch.category !== undefined) partial.category = patch.category ?? null
    if (patch.subCategory !== undefined) partial.subCategory = patch.subCategory ?? null
    if (patch.description !== undefined) partial.description = patch.description ?? null
    if (patch.coverAssetId !== undefined) partial.coverAssetId = patch.coverAssetId ?? null
    await this.scoped.update({ id } as FindOptionsWhere<AssetGroupEntity>, partial)
    return this.findById(id)
  }

  async delete(id: string): Promise<number> {
    return this.scoped.delete({ id } as FindOptionsWhere<AssetGroupEntity>)
  }
}
