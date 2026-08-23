/**
 * 新闻来源仓库（内置应用 C1 早报 / C2 周报的数据源）
 * @module core/database/repositories/news-source.repository
 * @description news_sources 表 CRUD：列表按主题分组、内置（is_builtin=1）全局共享
 *              合并展示、内置来源禁删禁改（用户可增删自己的来源）。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import { NewsSourceEntity } from '../entities/news-source.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

/** 新闻来源 DTO */
export interface NewsSourceRecord {
  id: string
  userId: string | null
  topicId: string
  name: string
  url: string
  isBuiltin: boolean
  enabled: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CreateNewsSourceInput {
  topicId: string
  name: string
  url: string
}

export interface UpdateNewsSourceInput {
  topicId?: string
  name?: string
  url?: string
  enabled?: boolean
}

export interface ListNewsSourceParams {
  topicId?: string | ''
  keyword?: string
}

export class NewsSourceRepository extends BaseRepository<NewsSourceEntity, NewsSourceRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, NewsSourceEntity)
  }

  private generateId(): string {
    return `ns_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  protected toDto(e: NewsSourceEntity): NewsSourceRecord {
    return {
      id: e.id,
      userId: e.userId,
      topicId: e.topicId,
      name: e.name,
      url: e.url,
      isBuiltin: e.isBuiltin === 1,
      enabled: e.enabled !== 0,
      sortOrder: e.sortOrder ?? 0,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : '',
      updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : '',
    }
  }

  /** 列表（含内置 + 自有；可按主题/关键字过滤；内置优先 + 排序权重） */
  async list(params: ListNewsSourceParams = {}): Promise<NewsSourceRecord[]> {
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('n')
      .where(
        userId ? '(n.user_id = :userId OR n.is_builtin = 1)' : '(n.user_id IS NULL OR n.is_builtin = 1)',
        userId ? { userId } : {},
      )
      // 业务分组：主题 → 内置优先 → 手动排序；组内按时间降序（最新添加的源在前）
      .orderBy('n.topic_id', 'ASC')
      .addOrderBy('n.is_builtin', 'DESC')
      .addOrderBy('n.sort_order', 'ASC')
      .addOrderBy('n.created_at', 'DESC')
    if (params.topicId) {
      qb.andWhere('n.topic_id = :topic', { topic: params.topicId })
    }
    const kw = params.keyword?.trim()
    if (kw) {
      qb.andWhere('(LOWER(n.name) LIKE LOWER(:kw) OR LOWER(n.url) LIKE LOWER(:kw))', { kw: `%${kw}%` })
    }
    const rows = await qb.getMany()
    return this.toDtoList(rows)
  }

  async findById(id: string): Promise<NewsSourceRecord | null> {
    const userId = getCurrentUserId()
    const qb = this.repo.createQueryBuilder('n').where('n.id = :id', { id })
    if (userId) {
      qb.andWhere('(n.user_id = :userId OR n.is_builtin = 1)', { userId })
    } else {
      qb.andWhere('(n.user_id IS NULL OR n.is_builtin = 1)')
    }
    const e = await qb.getOne()
    return e ? this.toDto(e) : null
  }

  /** 按 id 列表取（crawl-news 节点 sourceIds；含内置 + 自有 + 仅启用） */
  async listByIds(ids: string[]): Promise<NewsSourceRecord[]> {
    if (ids.length === 0) return []
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.id IN (:...ids)', { ids })
      .andWhere('n.enabled = 1')
    if (userId) {
      qb.andWhere('(n.user_id = :userId OR n.is_builtin = 1)', { userId })
    } else {
      qb.andWhere('(n.user_id IS NULL OR n.is_builtin = 1)')
    }
    const rows = await qb.getMany()
    return this.toDtoList(rows)
  }

  async create(data: CreateNewsSourceInput): Promise<NewsSourceRecord> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      topicId: data.topicId,
      name: data.name,
      url: data.url,
      isBuiltin: 0,
      enabled: 1,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as Partial<NewsSourceEntity>)
    return this.toDto(entity as NewsSourceEntity)
  }

  async update(id: string, patch: UpdateNewsSourceInput): Promise<NewsSourceRecord | null> {
    // 内置来源禁改（全局共享）
    const existing = await this.findById(id)
    if (existing?.isBuiltin) return existing
    const partial: Partial<NewsSourceEntity> = { updatedAt: new Date() }
    if (patch.topicId !== undefined) partial.topicId = patch.topicId
    if (patch.name !== undefined) partial.name = patch.name
    if (patch.url !== undefined) partial.url = patch.url
    if (patch.enabled !== undefined) partial.enabled = patch.enabled ? 1 : 0
    await this.scoped.update({ id } as FindOptionsWhere<NewsSourceEntity>, partial)
    return this.findById(id)
  }

  async delete(id: string): Promise<number> {
    // 内置来源禁删
    const existing = await this.findById(id)
    if (existing?.isBuiltin) return 0
    return this.scoped.delete({ id } as FindOptionsWhere<NewsSourceEntity>)
  }
}
