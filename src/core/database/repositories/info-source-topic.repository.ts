/**
 * 信息来源分组仓库（类别内的一级分组，原「新闻主题」）
 * @module core/database/repositories/info-source-topic.repository
 * @description info_source_topics CRUD：分组归属类别；内置分组（预置新闻主题）禁删禁改。
 *              每个类别有且仅有一个「未分组」默认分组（is_default=1）：id 由类别决定
 *              （ist_default_<categoryId>），主键天然保证唯一，用户不选分组时按需自动创建。
 *
 *              读取统一用「自有 OR 内置」条件（内置行 user_id=NULL 全局共享）。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import { InfoSourceTopicEntity } from '../entities/info-source-topic.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'
import {
  INFO_SOURCE_DEFAULT_TOPIC_NAME,
  type InfoSourceTopicRecord,
} from '@shared/types/info-source.types'

export interface CreateInfoSourceTopicInput {
  categoryId: string
  name: string
}

export interface UpdateInfoSourceTopicInput {
  name?: string
  categoryId?: string
}

export interface ListInfoSourceTopicParams {
  categoryId?: string
}

/** 默认分组（未分组）的固定 id：一个类别最多一个 */
export function defaultTopicIdOf(categoryId: string): string {
  return `ist_default_${categoryId}`
}

export class InfoSourceTopicRepository extends BaseRepository<
  InfoSourceTopicEntity,
  InfoSourceTopicRecord
> {
  constructor(dataSource: DataSource) {
    super(dataSource, InfoSourceTopicEntity)
  }

  private generateId(): string {
    return `ist_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  private visibleWhere(): { sql: string; params: Record<string, unknown> } {
    const userId = getCurrentUserId()
    return userId
      ? { sql: '(t.user_id = :userId OR t.is_builtin = 1)', params: { userId } }
      : { sql: '(t.user_id IS NULL OR t.is_builtin = 1)', params: {} }
  }

  protected toDto(e: InfoSourceTopicEntity): InfoSourceTopicRecord {
    return {
      id: e.id,
      userId: e.userId,
      categoryId: e.categoryId,
      name: e.name,
      isBuiltin: e.isBuiltin === 1,
      isDefault: e.isDefault === 1,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : '',
      updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : '',
    }
  }

  /**
   * 分组列表（可按类别过滤）。
   * 排序：内置分组在前 → 用户命名分组 → 默认分组（未分组）恒在末尾。
   */
  async list(params: ListInfoSourceTopicParams = {}): Promise<InfoSourceTopicRecord[]> {
    const visible = this.visibleWhere()
    const qb = this.repo
      .createQueryBuilder('t')
      .where(visible.sql, visible.params)
      .orderBy('t.is_builtin', 'DESC')
      .addOrderBy('t.is_default', 'ASC')
      .addOrderBy('t.created_at', 'ASC')
    if (params.categoryId) qb.andWhere('t.category_id = :categoryId', { categoryId: params.categoryId })
    const rows = await qb.getMany()
    return this.toDtoList(rows)
  }

  async findById(id: string): Promise<InfoSourceTopicRecord | null> {
    const visible = this.visibleWhere()
    const e = await this.repo
      .createQueryBuilder('t')
      .where('t.id = :id', { id })
      .andWhere(visible.sql, visible.params)
      .getOne()
    return e ? this.toDto(e) : null
  }

  /** 按 id 批量取（来源列表推导所属类别的辅助查询） */
  async listByIds(ids: string[]): Promise<InfoSourceTopicRecord[]> {
    if (ids.length === 0) return []
    const visible = this.visibleWhere()
    const rows = await this.repo
      .createQueryBuilder('t')
      .where('t.id IN (:...ids)', { ids })
      .andWhere(visible.sql, visible.params)
      .getMany()
    return this.toDtoList(rows)
  }

  async create(data: CreateInfoSourceTopicInput): Promise<InfoSourceTopicRecord> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      categoryId: data.categoryId,
      name: data.name,
      isBuiltin: 0,
      isDefault: 0,
      createdAt: now,
      updatedAt: now,
    } as Partial<InfoSourceTopicEntity>)
    return this.toDto(entity as InfoSourceTopicEntity)
  }

  /**
   * 取（按需创建）类别的默认分组「未分组」。
   * id 由类别 id 决定 → 并发下由主键兜底，不会出现两个默认分组。
   */
  async ensureDefault(categoryId: string): Promise<InfoSourceTopicRecord> {
    const id = defaultTopicIdOf(categoryId)
    const existing = await this.findById(id)
    if (existing) return existing
    const now = new Date()
    try {
      const entity = await this.scoped.save({
        id,
        categoryId,
        name: INFO_SOURCE_DEFAULT_TOPIC_NAME,
        isBuiltin: 0,
        isDefault: 1,
        createdAt: now,
        updatedAt: now,
      } as Partial<InfoSourceTopicEntity>)
      return this.toDto(entity as InfoSourceTopicEntity)
    } catch {
      // 并发创建撞主键：回读既有行
      const again = await this.findById(id)
      if (again) return again
      throw new Error(`默认分组创建失败（类别 ${categoryId}）`)
    }
  }

  /** 更新（内置分组与默认分组「未分组」禁改：原样返回） */
  async update(
    id: string,
    patch: UpdateInfoSourceTopicInput,
  ): Promise<InfoSourceTopicRecord | null> {
    const existing = await this.findById(id)
    if (!existing) return null
    if (existing.isBuiltin) return existing
    // 默认分组名是系统约定（界面上即「未分组」），不允许改名
    if (existing.isDefault && patch.name !== undefined) return existing
    const partial: Partial<InfoSourceTopicEntity> = { updatedAt: new Date() }
    if (patch.name !== undefined) partial.name = patch.name
    if (patch.categoryId !== undefined) partial.categoryId = patch.categoryId
    await this.scoped.update({ id } as FindOptionsWhere<InfoSourceTopicEntity>, partial)
    return this.findById(id)
  }

  /** 删除（内置分组与默认分组「未分组」禁删：返回 0；级联删类别走 deleteByCategory） */
  async delete(id: string): Promise<number> {
    const existing = await this.findById(id)
    if (!existing || existing.isBuiltin || existing.isDefault) return 0
    return this.scoped.delete({ id } as FindOptionsWhere<InfoSourceTopicEntity>)
  }

  /** 删除某类别下全部自有分组（级联删类别时用；内置分组不在用户类别下） */
  async deleteByCategory(categoryId: string): Promise<number> {
    const userId = getCurrentUserId()
    const where: FindOptionsWhere<InfoSourceTopicEntity> = { categoryId }
    if (userId) where.userId = userId
    return this.scoped.delete(where)
  }
}
