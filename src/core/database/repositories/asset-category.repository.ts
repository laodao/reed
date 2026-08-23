/**
 * 资产分类定义仓库
 * @module core/database/repositories/asset-category.repository
 * @description asset_categories 表 CRUD。allowed_kinds/allowed_categories 存 JSON 数组字符串，
 *              toDto 反序列化（与 asset.repository 同纪律）。分类定义为全局配置（无用户隔离）。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import type { AssetCategory, AssetCategoryDef, AssetPreviewMode, AssetStorageKind, SaveAssetCategoryInput, UpdateAssetCategoryInput } from '@shared/types/asset.types'
import { AssetCategoryEntity } from '../entities/asset-category.entity'
import { BaseRepository } from '../base-repository'

export class AssetCategoryRepository extends BaseRepository<AssetCategoryEntity, AssetCategoryDef> {
  constructor(dataSource: DataSource) {
    super(dataSource, AssetCategoryEntity)
  }

  private generateId(): string {
    return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  protected toDto(e: AssetCategoryEntity): AssetCategoryDef {
    return {
      id: e.id,
      name: e.name,
      code: e.code,
      allowedKinds: parseKindArray(e.allowedKinds),
      allowedCategories: parseCategoryArray(e.allowedCategories),
      previewable: e.previewable !== 0,
      previewMode: (e.previewMode as AssetPreviewMode) ?? 'auto',
      previewTemplateId: e.previewTemplateId,
      sortOrder: e.sortOrder ?? 0,
      isBuiltin: e.isBuiltin === 1,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : '',
      updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : '',
    }
  }

  /** 全量（按 sortOrder,name 排序） */
  async listAll(): Promise<AssetCategoryDef[]> {
    const rows = await this.scoped.find({ order: { sortOrder: 'ASC', name: 'ASC' } })
    return this.toDtoList(rows)
  }

  async findById(id: string): Promise<AssetCategoryDef | null> {
    const e = await this.scoped.findOne({ id } as FindOptionsWhere<AssetCategoryEntity>)
    return e ? this.toDto(e) : null
  }

  async findByName(name: string): Promise<AssetCategoryDef | null> {
    const e = await this.scoped.findOne({ name } as FindOptionsWhere<AssetCategoryEntity>)
    return e ? this.toDto(e) : null
  }

  async create(data: SaveAssetCategoryInput): Promise<AssetCategoryDef> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      name: data.name.trim(),
      code: data.code?.trim() || null,
      allowedKinds: data.allowedKinds?.length ? JSON.stringify(data.allowedKinds) : null,
      allowedCategories: data.allowedCategories?.length ? JSON.stringify(data.allowedCategories) : null,
      previewable: data.previewable === false ? 0 : 1,
      previewMode: data.previewMode ?? 'auto',
      previewTemplateId: data.previewTemplateId?.trim() || null,
      sortOrder: data.sortOrder ?? 0,
      isBuiltin: 0,
      createdAt: now,
      updatedAt: now,
    } as Partial<AssetCategoryEntity>)
    return this.toDto(entity as AssetCategoryEntity)
  }

  async update(id: string, patch: UpdateAssetCategoryInput): Promise<AssetCategoryDef | null> {
    const partial: Partial<AssetCategoryEntity> = { updatedAt: new Date() }
    if (patch.name !== undefined) partial.name = patch.name.trim()
    if (patch.code !== undefined) partial.code = patch.code?.trim() || null
    if (patch.allowedKinds !== undefined) partial.allowedKinds = patch.allowedKinds.length ? JSON.stringify(patch.allowedKinds) : null
    if (patch.allowedCategories !== undefined) partial.allowedCategories = patch.allowedCategories.length ? JSON.stringify(patch.allowedCategories) : null
    if (patch.previewable !== undefined) partial.previewable = patch.previewable === false ? 0 : 1
    if (patch.previewMode !== undefined) partial.previewMode = patch.previewMode
    if (patch.previewTemplateId !== undefined) partial.previewTemplateId = patch.previewTemplateId?.trim() || null
    if (patch.sortOrder !== undefined) partial.sortOrder = patch.sortOrder

    await this.scoped.update({ id } as FindOptionsWhere<AssetCategoryEntity>, partial)
    return this.findById(id)
  }

  /** 删除（内置分类禁删；仅删定义，不动资产） */
  async delete(id: string): Promise<number> {
    const existing = await this.findById(id)
    if (existing?.isBuiltin) return 0
    return this.scoped.delete({ id } as FindOptionsWhere<AssetCategoryEntity>)
  }
}

function parseKindArray(raw: string | null | undefined): AssetStorageKind[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) as AssetStorageKind[] : []
  } catch {
    return []
  }
}

function parseCategoryArray(raw: string | null | undefined): AssetCategory[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) as AssetCategory[] : []
  } catch {
    return []
  }
}
