/**
 * 新闻主题仓库（内置应用 C1 早报 / C2 周报的数据源分组）
 * @module core/database/repositories/news-topic.repository
 * @description news_topics 表 CRUD：内置（is_builtin=1）全局共享合并展示；
 *              删除主题时级联删除其下来源（来源仓库负责）；内置主题有来源时禁删。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import { NewsTopicEntity } from '../entities/news-topic.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

/** 新闻主题 DTO */
export interface NewsTopicRecord {
  id: string
  userId: string | null
  name: string
  isBuiltin: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateNewsTopicInput {
  name: string
}

export interface UpdateNewsTopicInput {
  name?: string
}

export class NewsTopicRepository extends BaseRepository<NewsTopicEntity, NewsTopicRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, NewsTopicEntity)
  }

  private generateId(): string {
    return `topic_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  protected toDto(e: NewsTopicEntity): NewsTopicRecord {
    return {
      id: e.id,
      userId: e.userId,
      name: e.name,
      isBuiltin: e.isBuiltin === 1,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : '',
      updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : '',
    }
  }

  /** 全部主题（内置优先 + 创建时间升序——内置主题在前，自定义主题按添加顺序） */
  async listAll(): Promise<NewsTopicRecord[]> {
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('t')
      .where(
        userId ? '(t.user_id = :userId OR t.is_builtin = 1)' : '(t.user_id IS NULL OR t.is_builtin = 1)',
        userId ? { userId } : {},
      )
      .orderBy('t.is_builtin', 'DESC')
      .addOrderBy('t.created_at', 'ASC')
    const rows = await qb.getMany()
    return this.toDtoList(rows)
  }

  async findById(id: string): Promise<NewsTopicRecord | null> {
    const e = await this.scoped.findOne({ id } as FindOptionsWhere<NewsTopicEntity>)
    return e ? this.toDto(e) : null
  }

  async create(data: CreateNewsTopicInput): Promise<NewsTopicRecord> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      userId: null, // BaseRepository 注入
      name: data.name,
      isBuiltin: 0,
      createdAt: now,
      updatedAt: now,
    } as Partial<NewsTopicEntity>)
    return this.toDto(entity as NewsTopicEntity)
  }

  async update(id: string, patch: UpdateNewsTopicInput): Promise<NewsTopicRecord | null> {
    const partial: Partial<NewsTopicEntity> = { updatedAt: new Date() }
    if (patch.name !== undefined) partial.name = patch.name
    await this.scoped.update({ id } as FindOptionsWhere<NewsTopicEntity>, partial)
    return this.findById(id)
  }

  async delete(id: string): Promise<number> {
    return this.scoped.delete({ id } as FindOptionsWhere<NewsTopicEntity>)
  }
}
