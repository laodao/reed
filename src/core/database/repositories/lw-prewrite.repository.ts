/**
 * 长文写作章节预写仓库
 * @module database/repositories/lw-prewrite.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, type DataSource } from 'typeorm'
import {
  ChapterPrewrite,
  CreatePrewriteRequest,
  UpdatePrewriteRequest,
} from '@shared/types/longwriting.types'
import { LwPrewriteEntity } from '../entities/lw-prewrite.entity'
import { BaseRepository } from '../base-repository'

export class LwPrewriteRepository extends BaseRepository<
  LwPrewriteEntity,
  ChapterPrewrite
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwPrewriteEntity)
  }

  protected toDto(e: LwPrewriteEntity): ChapterPrewrite {
    return {
      id: e.id,
      outlineId: e.outlineId,
      content: e.content || '',
      isConfirmed: e.isConfirmed === 1,
      confirmedAt: e.confirmedAt ?? undefined,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async getByOutlineId(outlineId: string): Promise<ChapterPrewrite | null> {
    return this.findOneByWhere({ outlineId } as any)
  }

  async getById(id: string): Promise<ChapterPrewrite | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getByOutlineIds(outlineIds: string[]): Promise<Map<string, ChapterPrewrite>> {
    if (outlineIds.length === 0) return new Map()
    const entities = await this.repo.find({
      where: { outlineId: In(outlineIds) } as any,
    })
    const result = new Map<string, ChapterPrewrite>()
    for (const e of entities) {
      result.set(e.outlineId, this.toDto(e))
    }
    return result
  }

  async create(data: CreatePrewriteRequest): Promise<ChapterPrewrite> {
    const id = this.generateId()
    const now = Date.now()
    const entity = this.repo.create({
      id,
      outlineId: data.outlineId,
      content: data.content,
      isConfirmed: 0,
      confirmedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async update(
    outlineId: string,
    data: UpdatePrewriteRequest,
  ): Promise<ChapterPrewrite | null> {
    const existing = await this.repo.findOne({ where: { outlineId } as any })
    if (!existing) return null

    let changed = false
    if (data.content !== undefined) {
      existing.content = data.content
      changed = true
    }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = Date.now()
    const saved = await this.repo.save(existing)
    return this.toDto(saved)
  }

  async confirm(outlineId: string): Promise<ChapterPrewrite | null> {
    const existing = await this.repo.findOne({ where: { outlineId } as any })
    if (!existing) return null
    const now = Date.now()
    existing.isConfirmed = 1
    existing.confirmedAt = now
    existing.updatedAt = now
    const saved = await this.repo.save(existing)
    return this.toDto(saved)
  }

  async unconfirm(outlineId: string): Promise<ChapterPrewrite | null> {
    const existing = await this.repo.findOne({ where: { outlineId } as any })
    if (!existing) return null
    existing.isConfirmed = 0
    existing.confirmedAt = null
    existing.updatedAt = Date.now()
    const saved = await this.repo.save(existing)
    return this.toDto(saved)
  }

  async delete(outlineId: string): Promise<boolean> {
    const result = await this.repo.delete({ outlineId } as any)
    return (result.affected ?? 0) > 0
  }

  async save(data: CreatePrewriteRequest): Promise<ChapterPrewrite> {
    const existing = await this.getByOutlineId(data.outlineId)
    if (existing) {
      return (await this.update(data.outlineId, { content: data.content }))!
    }
    return this.create(data)
  }

  private generateId(): string {
    return `prewrite_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
