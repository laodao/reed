/**
 * 信息来源类别仓库（设置界面「信息来源」的顶层分组：一个类别 = 一个 tab）
 * @module core/database/repositories/info-source-category.repository
 * @description info_source_categories CRUD：内置类别（is_builtin=1，如「新闻来源」）全局共享、
 *              禁删禁改；用户类别可改名、删除（级联删分组与来源，由 handler 编排）。
 *
 *              读取统一用「自有 OR 内置」条件（内置行 user_id=NULL 全局共享）：
 *              scoped 只按 user_id 过滤，取不到内置行，故列表/详情走显式条件。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import { InfoSourceCategoryEntity } from '../entities/info-source-category.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'
import type { InfoSourceCategoryRecord } from '@shared/types/info-source.types'

export interface CreateInfoSourceCategoryInput {
  name: string
  sortOrder?: number
}

export interface UpdateInfoSourceCategoryInput {
  name?: string
  sortOrder?: number
}

export class InfoSourceCategoryRepository extends BaseRepository<
  InfoSourceCategoryEntity,
  InfoSourceCategoryRecord
> {
  constructor(dataSource: DataSource) {
    super(dataSource, InfoSourceCategoryEntity)
  }

  /** 生成类别 id（用户自建；内置类别 id 由迁移固定给出） */
  private generateId(): string {
    return `isc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  /** 「自有 OR 内置」可见性条件（内置 = 全局共享的预置类别） */
  private visibleWhere(): { sql: string; params: Record<string, unknown> } {
    const userId = getCurrentUserId()
    return userId
      ? { sql: '(c.user_id = :userId OR c.is_builtin = 1)', params: { userId } }
      : { sql: '(c.user_id IS NULL OR c.is_builtin = 1)', params: {} }
  }

  protected toDto(e: InfoSourceCategoryEntity): InfoSourceCategoryRecord {
    return {
      id: e.id,
      userId: e.userId,
      name: e.name,
      isBuiltin: e.isBuiltin === 1,
      sortOrder: e.sortOrder ?? 0,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : '',
      updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : '',
    }
  }

  /** 全部可见类别（内置在前；其后按排序权重、创建时间） */
  async listAll(): Promise<InfoSourceCategoryRecord[]> {
    const visible = this.visibleWhere()
    const rows = await this.repo
      .createQueryBuilder('c')
      .where(visible.sql, visible.params)
      .orderBy('c.is_builtin', 'DESC')
      .addOrderBy('c.sort_order', 'ASC')
      .addOrderBy('c.created_at', 'ASC')
      .getMany()
    return this.toDtoList(rows)
  }

  async findById(id: string): Promise<InfoSourceCategoryRecord | null> {
    const visible = this.visibleWhere()
    const e = await this.repo
      .createQueryBuilder('c')
      .where('c.id = :id', { id })
      .andWhere(visible.sql, visible.params)
      .getOne()
    return e ? this.toDto(e) : null
  }

  async create(data: CreateInfoSourceCategoryInput): Promise<InfoSourceCategoryRecord> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      name: data.name,
      isBuiltin: 0,
      sortOrder: data.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    } as Partial<InfoSourceCategoryEntity>)
    return this.toDto(entity as InfoSourceCategoryEntity)
  }

  /** 更新（内置类别禁改：原样返回） */
  async update(
    id: string,
    patch: UpdateInfoSourceCategoryInput,
  ): Promise<InfoSourceCategoryRecord | null> {
    const existing = await this.findById(id)
    if (!existing) return null
    if (existing.isBuiltin) return existing
    const partial: Partial<InfoSourceCategoryEntity> = { updatedAt: new Date() }
    if (patch.name !== undefined) partial.name = patch.name
    if (patch.sortOrder !== undefined) partial.sortOrder = patch.sortOrder
    await this.scoped.update({ id } as FindOptionsWhere<InfoSourceCategoryEntity>, partial)
    return this.findById(id)
  }

  /** 删除（内置类别禁删：返回 0） */
  async delete(id: string): Promise<number> {
    const existing = await this.findById(id)
    if (!existing || existing.isBuiltin) return 0
    return this.scoped.delete({ id } as FindOptionsWhere<InfoSourceCategoryEntity>)
  }
}
