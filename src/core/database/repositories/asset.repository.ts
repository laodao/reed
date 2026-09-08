/**
 * 通用资产仓库
 * @module core/database/repositories/asset.repository
 * @description assets 表 CRUD + 分页查询。tags/metadata 列存 JSON 字符串，
 *              在 toDto/写入处手工序列化（与 workflow-run.repository 同纪律）。
 */

import type { DataSource, FindOptionsWhere, SelectQueryBuilder } from 'typeorm'
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
  groupId?: string | null
  groupRole?: string | null
}

export interface UpdateAssetInput {
  category?: AssetCategory
  subCategory?: string | null
  name?: string
  description?: string | null
  tags?: string[]
  /** 内容/元数据就地重写（file 刷新等场景；显式 undefined = 不修改） */
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

export interface ListAssetParams {
  category?: AssetCategory | ''
  subCategory?: string | ''
  /** 精确 url 列匹配（网页收藏幂等查重） */
  url?: string
  keyword?: string
  /** 排除某子分类（如「全部 / 文档」视图默认不含网页收藏池） */
  excludeSubCategory?: string | ''
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
      groupId: e.groupId,
      groupRole: e.groupRole,
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

  /**
   * 分页列表（创建时间倒序——最新资产在前；含全局内置）。
   *
   * 分页单位是「展示卡片」而非资产记录：同组（groupId）资产在前端会聚合成一张组卡片，
   * 若按记录分页会导致每页卡片数忽多忽少、同一组被拆到多页重复出现。
   * 这里先按卡片键（单资产=自身 id，组=group_id）折叠分页，再取本页卡片的完整记录，
   * 保证：每页恰好 pageSize 张卡片（末页除外）、组不跨页、total=卡片总数。
   * 排序键：组卡片取组内最新成员时间（与前端聚合展示一致），内置资产靠后。
   */
  async listAsset(params: ListAssetParams): Promise<{ items: AssetRecord[]; total: number }> {
    const userId = getCurrentUserId()
    // 卡片键：单资产 → 自身 id；组内成员 → group_id
    const cardKeyExpr = 'CASE WHEN a.group_id IS NULL THEN a.id ELSE a.group_id END'
    const scopeCond = userId
      ? '(a.user_id = :userId OR a.is_builtin = 1)'
      : '(a.user_id IS NULL OR a.is_builtin = 1)'
    const scopeParams = userId ? { userId } : {}

    // 1) 本页卡片键（过滤在折叠前应用：组内任一成员命中即整组计入）
    const keyQb = this.repo
      .createQueryBuilder('a')
      .select(cardKeyExpr, 'card_key')
      .addSelect('MAX(a.created_at)', 'latest_created_at')
      .addSelect('MIN(a.is_builtin)', 'min_builtin')
      .where(scopeCond, scopeParams)
    this.applyAssetListFilters(keyQb, params)
    keyQb
      .groupBy(cardKeyExpr)
      .orderBy('latest_created_at', 'DESC')
      .addOrderBy('min_builtin', 'ASC')
      .addOrderBy('card_key', 'ASC')
      .offset((params.page - 1) * params.pageSize)
      .limit(params.pageSize)
    const keyRows = await keyQb.getRawMany()
    const keys: string[] = keyRows.map(r => r.card_key as string)

    // 2) 卡片总数（组算一张）
    const totalQb = this.repo
      .createQueryBuilder('a')
      .select(`COUNT(DISTINCT ${cardKeyExpr})`, 'total')
      .where(scopeCond, scopeParams)
    this.applyAssetListFilters(totalQb, params)
    const totalRow = await totalQb.getRawOne()
    const total = Number(totalRow?.total ?? 0)

    // 3) 取本页卡片的完整记录：单资产按 id；组取全部成员（过滤与 1) 一致，
    //    保证组卡片只含「当前过滤下可见」的成员，与旧行为（过滤后再聚合）一致）
    if (!keys.length) return { items: [], total }
    const itemQb = this.repo
      .createQueryBuilder('a')
      .where(scopeCond, scopeParams)
    this.applyAssetListFilters(itemQb, params)
    itemQb
      .andWhere('(a.id IN (:...keys) OR a.group_id IN (:...keys))', { keys })
      .orderBy('a.created_at', 'DESC')
      .addOrderBy('a.is_builtin', 'ASC')
      .addOrderBy('a.id', 'ASC')
    const rows = await itemQb.getMany()
    return { items: this.toDtoList(rows), total }
  }

  /** 列表过滤条件（category / subCategory / keyword），卡片折叠前逐条记录应用 */
  private applyAssetListFilters(
    qb: SelectQueryBuilder<AssetEntity>,
    params: ListAssetParams,
  ): void {
    if (params.category) {
      qb.andWhere('a.category = :cat', { cat: params.category })
    }
    if (params.subCategory) {
      qb.andWhere('a.sub_category = :sub', { sub: params.subCategory })
    }
    if (params.url) {
      qb.andWhere('a.url = :url', { url: params.url })
    }
    if (params.excludeSubCategory) {
      qb.andWhere('(a.sub_category IS NULL OR a.sub_category <> :exSub)', { exSub: params.excludeSubCategory })
    }
    const kw = params.keyword?.trim()
    if (kw) {
      qb.andWhere('(LOWER(a.name) LIKE LOWER(:kw) OR LOWER(a.description) LIKE LOWER(:kw) OR LOWER(a.tags) LIKE LOWER(:kw))', { kw: `%${kw}%` })
    }
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

  /** 组内成员资产（组卡片画廊；创建时间升序——封面在前） */
  async findByGroup(groupId: string): Promise<AssetRecord[]> {
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.group_id = :gid', { gid: groupId })
    if (userId) {
      qb.andWhere('(a.user_id = :userId OR a.is_builtin = 1)', { userId })
    } else {
      qb.andWhere('(a.user_id IS NULL OR a.is_builtin = 1)')
    }
    qb.orderBy('a.created_at', 'ASC').addOrderBy('a.id', 'ASC')
    const rows = await qb.getMany()
    return this.toDtoList(rows)
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
      groupId: data.groupId ?? null,
      groupRole: data.groupRole ?? null,
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
    // 内容/元数据就地重写（file 刷新；undefined = 不改，null = 清空）
    if (patch.storagePath !== undefined) partial.storagePath = patch.storagePath
    if (patch.url !== undefined) partial.url = patch.url
    if (patch.textContent !== undefined) partial.textContent = patch.textContent
    if (patch.jsonContent !== undefined) partial.jsonContent = patch.jsonContent
    if (patch.mimeType !== undefined) partial.mimeType = patch.mimeType
    if (patch.sizeBytes !== undefined) partial.sizeBytes = patch.sizeBytes
    if (patch.metadata !== undefined) {
      partial.metadata = patch.metadata ? JSON.stringify(patch.metadata) : null
    }
    if (patch.sourceType !== undefined) partial.sourceType = patch.sourceType
    if (patch.sourceRef !== undefined) partial.sourceRef = patch.sourceRef

    await this.scoped.update({ id } as FindOptionsWhere<AssetEntity>, partial)
    return this.findById(id)
  }

  /**
   * 按 url 列精确查最新一条（网页收藏幂等查重键；url 列对 file 型网页收藏承载源链接）。
   * 走成熟 listAsset 查询管线（卡片分页语义：单资产=自身）。
   */
  async findLatestByUrl(
    category: AssetCategory,
    subCategory: string,
    url: string,
  ): Promise<AssetRecord | null> {
    const { items } = await this.listAsset({ category, subCategory, url, page: 1, pageSize: 1 })
    return items[0] ?? null
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
