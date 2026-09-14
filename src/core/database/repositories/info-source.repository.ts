/**
 * 信息来源仓库（通用信息源目录：名称 + URL）
 * @module core/database/repositories/info-source.repository
 * @description info_sources CRUD：来源归属分组（topic_id），分组归属类别。
 *              内置来源（is_builtin=1）全局共享合并展示、禁删禁改；用户可增删自有来源。
 *              工作流 crawl-news 节点按 sourceIds 多选抓取，或按 topicId 整组抓取。
 *
 *              读取统一用「自有 OR 内置」条件（内置行 user_id=NULL 全局共享）。
 */

import { In } from 'typeorm'
import type { DataSource, FindOptionsWhere } from 'typeorm'
import { InfoSourceEntity } from '../entities/info-source.entity'
import { InfoSourceTopicEntity } from '../entities/info-source-topic.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'
import type { InfoSourceRecord } from '@shared/types/info-source.types'

export interface CreateInfoSourceInput {
  topicId: string
  name: string
  url: string
}

export interface UpdateInfoSourceInput {
  topicId?: string
  name?: string
  url?: string
  enabled?: boolean
}

export interface ListInfoSourceParams {
  /** 类别过滤（跨分组合并；与 topicId 同时给出时以 topicId 为准） */
  categoryId?: string
  /** 分组过滤 */
  topicId?: string
  /** 名称/URL 模糊匹配 */
  keyword?: string
  /** 仅启用的来源（工作流采集用；设置界面需要看到停用项，故默认 false） */
  onlyEnabled?: boolean
}

export class InfoSourceRepository extends BaseRepository<InfoSourceEntity, InfoSourceRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, InfoSourceEntity)
  }

  private generateId(): string {
    return `is_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  private visibleWhere(): { sql: string; params: Record<string, unknown> } {
    const userId = getCurrentUserId()
    return userId
      ? { sql: '(n.user_id = :userId OR n.is_builtin = 1)', params: { userId } }
      : { sql: '(n.user_id IS NULL OR n.is_builtin = 1)', params: {} }
  }

  protected toDto(e: InfoSourceEntity): InfoSourceRecord {
    return {
      id: e.id,
      userId: e.userId,
      topicId: e.topicId,
      categoryId: '',
      name: e.name,
      url: e.url,
      isBuiltin: e.isBuiltin === 1,
      enabled: e.enabled !== 0,
      sortOrder: e.sortOrder ?? 0,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : '',
      updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : '',
    }
  }

  /**
   * 补齐来源的所属类别（由其分组推导）。
   * 类别不在来源表冗余存储（第三范式），列表接口按需批量回填。
   */
  private async withCategory(rows: InfoSourceEntity[]): Promise<InfoSourceRecord[]> {
    const list = this.toDtoList(rows)
    if (list.length === 0) return list
    const topicIds = [...new Set(list.map(r => r.topicId).filter(Boolean))]
    const userId = getCurrentUserId()
    const topics = await this.dataSource
      .getRepository(InfoSourceTopicEntity)
      .createQueryBuilder('t')
      .where('t.id IN (:...topicIds)', { topicIds })
      // 与列表同款可见性：内置分组 user_id=NULL 全局共享，必须与自有分组一并取回
      .andWhere(
        userId ? '(t.user_id = :userId OR t.is_builtin = 1)' : '(t.user_id IS NULL OR t.is_builtin = 1)',
        userId ? { userId } : {},
      )
      .getMany()
    const map = new Map(topics.map(t => [t.id, t.categoryId]))
    for (const r of list) r.categoryId = map.get(r.topicId) ?? ''
    return list
  }

  /**
   * 列表（含内置 + 自有；可按类别/分组/关键字过滤）。
   * 排序：类别 → 分组 → 内置优先 → 手动排序 → 最新添加。
   */
  async list(params: ListInfoSourceParams = {}): Promise<InfoSourceRecord[]> {
    const visible = this.visibleWhere()
    const qb = this.repo
      .createQueryBuilder('n')
      .leftJoin(InfoSourceTopicEntity, 't', 't.id = n.topic_id')
      .where(visible.sql, visible.params)
      .orderBy('t.category_id', 'ASC')
      .addOrderBy('n.topic_id', 'ASC')
      .addOrderBy('n.is_builtin', 'DESC')
      .addOrderBy('n.sort_order', 'ASC')
      .addOrderBy('n.created_at', 'DESC')
    if (params.topicId) {
      qb.andWhere('n.topic_id = :topicId', { topicId: params.topicId })
    } else if (params.categoryId) {
      qb.andWhere('t.category_id = :categoryId', { categoryId: params.categoryId })
    }
    if (params.onlyEnabled) qb.andWhere('n.enabled = 1')
    const kw = params.keyword?.trim()
    if (kw) {
      qb.andWhere('(LOWER(n.name) LIKE LOWER(:kw) OR LOWER(n.url) LIKE LOWER(:kw))', { kw: `%${kw}%` })
    }
    return this.withCategory(await qb.getMany())
  }

  async findById(id: string): Promise<InfoSourceRecord | null> {
    const visible = this.visibleWhere()
    const e = await this.repo
      .createQueryBuilder('n')
      .where('n.id = :id', { id })
      .andWhere(visible.sql, visible.params)
      .getOne()
    const [dto] = e ? await this.withCategory([e]) : []
    return dto ?? null
  }

  /** 按 id 列表取（crawl-news 节点 sourceIds；含内置 + 自有 + 仅启用） */
  async listByIds(ids: string[]): Promise<InfoSourceRecord[]> {
    if (ids.length === 0) return []
    const visible = this.visibleWhere()
    const rows = await this.repo
      .createQueryBuilder('n')
      .where('n.id IN (:...ids)', { ids })
      .andWhere('n.enabled = 1')
      .andWhere(visible.sql, visible.params)
      .getMany()
    return this.withCategory(rows)
  }

  /** 按分组取启用来源（crawl-news 节点 topicId 整组抓取） */
  async listByTopic(topicId: string, onlyEnabled = true): Promise<InfoSourceRecord[]> {
    return this.list({ topicId, onlyEnabled })
  }

  async create(data: CreateInfoSourceInput): Promise<InfoSourceRecord> {
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
    } as Partial<InfoSourceEntity>)
    const [dto] = await this.withCategory([entity as InfoSourceEntity])
    return dto
  }

  async update(id: string, patch: UpdateInfoSourceInput): Promise<InfoSourceRecord | null> {
    // 内置来源禁改（全局共享）
    const existing = await this.findById(id)
    if (existing?.isBuiltin) return existing
    const partial: Partial<InfoSourceEntity> = { updatedAt: new Date() }
    if (patch.topicId !== undefined) partial.topicId = patch.topicId
    if (patch.name !== undefined) partial.name = patch.name
    if (patch.url !== undefined) partial.url = patch.url
    if (patch.enabled !== undefined) partial.enabled = patch.enabled ? 1 : 0
    await this.scoped.update({ id } as FindOptionsWhere<InfoSourceEntity>, partial)
    return this.findById(id)
  }

  async delete(id: string): Promise<number> {
    // 内置来源禁删
    const existing = await this.findById(id)
    if (existing?.isBuiltin) return 0
    return this.scoped.delete({ id } as FindOptionsWhere<InfoSourceEntity>)
  }

  /** 分组下来源数（删除分组前的占用检查） */
  async countByTopic(topicId: string): Promise<number> {
    const visible = this.visibleWhere()
    return this.repo
      .createQueryBuilder('n')
      .where('n.topic_id = :topicId', { topicId })
      .andWhere(visible.sql, visible.params)
      .getCount()
  }

  /** 删除某分组下全部自有来源（内置来源保留：分组删除时清空用户自有项） */
  async deleteByTopic(topicId: string): Promise<number> {
    const userId = getCurrentUserId()
    const where: FindOptionsWhere<InfoSourceEntity> = { topicId, isBuiltin: 0 }
    if (userId) where.userId = userId
    return this.scoped.delete(where)
  }

  /** 删除多个分组下全部自有来源（级联删分组时用） */
  async deleteByTopics(topicIds: string[]): Promise<number> {
    if (topicIds.length === 0) return 0
    const userId = getCurrentUserId()
    const where: FindOptionsWhere<InfoSourceEntity> = { topicId: In(topicIds), isBuiltin: 0 }
    if (userId) where.userId = userId
    return this.scoped.delete(where)
  }
}
