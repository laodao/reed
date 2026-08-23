/**
 * 通用资产仓库
 * @module core/database/repositories/asset.repository
 * @description assets 表 CRUD + 分页查询。tags/metadata 列存 JSON 字符串，
 *              在 toDto/写入处手工序列化（与 workflow-run.repository 同纪律）。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import type { AssetCategory, AssetRecord } from '@shared/types/asset.types'
import { AssetEntity } from '../entities/asset.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface CreateAssetInput {
  category: AssetCategory
  subCategory?: string | null
  name: string
  description?: string | null
  tags?: string[]
  kind: string
  storagePath?: string | null
  url?: string | null
  textContent?: string | null
  jsonContent?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
  metadata?: Record<string, unknown> | null
  sourceType?: string | null
  sourceRef?: string | null
}

export interface UpdateAssetInput {
  category?: AssetCategory
  subCategory?: string | null
  name?: string
  description?: string | null
  tags?: string[]
}

export interface ListAssetParams {
  category?: AssetCategory | ''
  subCategory?: string | ''
  keyword?: string
  page: number
  pageSize: number
}

export class AssetRepository extends BaseRepository<AssetEntity, AssetRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, AssetEntity)
  }

  private generateId(): string {
    return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  protected toDto(e: AssetEntity): AssetRecord {
    return {
      id: e.id,
      userId: e.userId,
      category: e.category as AssetCategory,
      subCategory: e.subCategory,
      name: e.name,
      description: e.description,
      tags: parseJsonArray(e.tags),
      kind: e.kind as AssetRecord['kind'],
      storagePath: e.storagePath,
      url: e.url,
      textContent: e.textContent,
      jsonContent: e.jsonContent,
      mimeType: e.mimeType,
      sizeBytes: e.sizeBytes,
      metadata: parseJsonObject(e.metadata),
      sourceType: e.sourceType,
      sourceRef: e.sourceRef,
      isBuiltin: e.isBuiltin === 1,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : '',
      updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : '',
    }
  }

  async findById(id: string): Promise<AssetRecord | null> {
    // 自己的 + 内置（全局共享）
    const userId = getCurrentUserId()
    const qb = this.repo.createQueryBuilder('a').where('a.id = :id', { id })
    if (userId) {
      qb.andWhere('(a.user_id = :userId OR a.is_builtin = 1)', { userId })
    } else {
      qb.andWhere('(a.user_id IS NULL OR a.is_builtin = 1)')
    }
    const e = await qb.getOne()
    return e ? this.toDto(e) : null
  }

  /** 分页列表（创建时间倒序——最新资产在前；含全局内置） */
  async listAsset(params: ListAssetParams): Promise<{ items: AssetRecord[]; total: number }> {
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('a')
      .where(
        userId ? '(a.user_id = :userId OR a.is_builtin = 1)' : '(a.user_id IS NULL OR a.is_builtin = 1)',
        userId ? { userId } : {},
      )
      // 统一时间降序：创建时间倒序；is_builtin 仅作同时间稳定次级（内置资产放后）
      .orderBy('a.created_at', 'DESC')
      .addOrderBy('a.is_builtin', 'ASC')
      .addOrderBy('a.id', 'ASC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
    if (params.category) {
      qb.andWhere('a.category = :cat', { cat: params.category })
    }
    if (params.subCategory) {
      qb.andWhere('a.sub_category = :sub', { sub: params.subCategory })
    }
    const kw = params.keyword?.trim()
    if (kw) {
      qb.andWhere('(LOWER(a.name) LIKE LOWER(:kw) OR LOWER(a.description) LIKE LOWER(:kw) OR LOWER(a.tags) LIKE LOWER(:kw))', { kw: `%${kw}%` })
    }
    const [rows, total] = await qb.getManyAndCount()
    return { items: this.toDtoList(rows), total }
  }

  /** 指定大类下的子分类计数（资产中心二级分组；含内置） */
  async countBySubCategory(category: AssetCategory): Promise<Array<{ subCategory: string | null; count: number }>> {
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('a')
      .select('a.sub_category', 'subCategory')
      .addSelect('COUNT(*)', 'count')
      .where('a.category = :cat', { cat: category })
    if (userId) {
      qb.andWhere('(a.user_id = :userId OR a.is_builtin = 1)', { userId })
    } else {
      qb.andWhere('(a.user_id IS NULL OR a.is_builtin = 1)')
    }
    qb.groupBy('a.sub_category')
    const rows = await qb.getRawMany()
    return rows.map(r => ({ subCategory: (r.subCategory as string | null) ?? null, count: Number(r.count ?? 0) }))
  }

  /** 各分类数量统计（资产中心头部；含内置） */
  async countByCategory(): Promise<Array<{ category: string; count: number }>> {
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('a')
      .select('a.category', 'category')
      .addSelect('COUNT(*)', 'count')
    if (userId) {
      qb.where('(a.user_id = :userId OR a.is_builtin = 1)', { userId })
    } else {
      qb.where('(a.user_id IS NULL OR a.is_builtin = 1)')
    }
    qb.groupBy('a.category')
    const rows = await qb.getRawMany()
    return rows.map(r => ({ category: r.category as string, count: Number(r.count ?? 0) }))
  }

  async create(data: CreateAssetInput): Promise<AssetRecord> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      userId: null, // BaseRepository 注入 user_id
      category: data.category,
      subCategory: data.subCategory ?? null,
      name: data.name,
      description: data.description ?? null,
      tags: data.tags?.length ? JSON.stringify(data.tags) : null,
      kind: data.kind,
      storagePath: data.storagePath ?? null,
      url: data.url ?? null,
      textContent: data.textContent ?? null,
      jsonContent: data.jsonContent ?? null,
      mimeType: data.mimeType ?? null,
      sizeBytes: data.sizeBytes ?? null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      sourceType: data.sourceType ?? null,
      sourceRef: data.sourceRef ?? null,
      createdAt: now,
      updatedAt: now,
    } as Partial<AssetEntity>)
    return this.toDto(entity as AssetEntity)
  }

  async update(id: string, patch: UpdateAssetInput): Promise<AssetRecord | null> {
    const partial: Partial<AssetEntity> = { updatedAt: new Date() }
    if (patch.category !== undefined) partial.category = patch.category
    if (patch.subCategory !== undefined) partial.subCategory = patch.subCategory
    if (patch.name !== undefined) partial.name = patch.name
    if (patch.description !== undefined) partial.description = patch.description
    if (patch.tags !== undefined) partial.tags = patch.tags.length ? JSON.stringify(patch.tags) : null

    await this.scoped.update({ id } as FindOptionsWhere<AssetEntity>, partial)
    return this.findById(id)
  }

  async delete(id: string): Promise<number> {
    // 内置资产禁删（复制为自有后可删副本）
    const existing = await this.findById(id)
    if (existing?.isBuiltin) return 0
    return this.scoped.delete({ id } as FindOptionsWhere<AssetEntity>)
  }
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}
