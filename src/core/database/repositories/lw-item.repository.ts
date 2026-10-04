/**
 * 物品仓库
 * @module database/repositories/lw-item.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  StoryItem,
  ItemType,
  ItemLevel,
  EntityImportance,
  EntitySourceType,
} from '@shared/types/longwriting.types'
import { LwItemEntity } from '../entities/lw-item.entity'
import { BaseRepository } from '../base-repository'

export class LwItemRepository extends BaseRepository<LwItemEntity, StoryItem> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwItemEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: LwItemEntity): StoryItem {
    return {
      id: e.id,
      projectId: e.projectId,
      name: e.name,
      type: e.type as ItemType,
      level: e.level as ItemLevel,
      importance: (e.importance as EntityImportance) || 'secondary',
      description: e.description ?? '',
      ownerId: e.ownerId ?? undefined,
      sourceType: (e.sourceType as EntitySourceType) || 'longwriting',
      sourceEpisodeId: e.sourceEpisodeId ?? undefined,
      libraryWorldId: e.libraryWorldId ?? undefined,
      libraryEntryId: e.libraryEntryId ?? undefined,
      libraryVersion: e.libraryVersion ?? undefined,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    } as StoryItem
  }

  async getByProjectId(projectId: string): Promise<StoryItem[]> {
    return this.findManyByWhere({ projectId } as any, { createdAt: 'DESC' })
  }

  async getById(id: string): Promise<StoryItem | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getBySourceEpisodeId(episodeId: string): Promise<StoryItem[]> {
    return this.findManyByWhere(
      { sourceEpisodeId: episodeId } as any,
      { createdAt: 'DESC' },
    )
  }

  async create(data: {
    projectId: string
    name: string
    type: ItemType
    level: ItemLevel
    importance?: EntityImportance
    description: string
    ownerId?: string
    sourceType?: EntitySourceType
    sourceEpisodeId?: string
  }): Promise<StoryItem> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      name: data.name,
      type: data.type,
      level: data.level,
      importance: data.importance || 'secondary',
      description: data.description,
      ownerId: data.ownerId ?? null,
      sourceType: data.sourceType || 'longwriting',
      sourceEpisodeId: data.sourceEpisodeId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: Partial<StoryItem>,
  ): Promise<StoryItem | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.name !== undefined) { existing.name = data.name; changed = true }
    if (data.type !== undefined) { existing.type = data.type; changed = true }
    if (data.level !== undefined) { existing.level = data.level; changed = true }
    if (data.importance !== undefined) { existing.importance = data.importance; changed = true }
    if (data.description !== undefined) { existing.description = data.description; changed = true }
    if (data.ownerId !== undefined) { existing.ownerId = data.ownerId ?? null; changed = true }
    if (data.sourceType !== undefined) { existing.sourceType = data.sourceType; changed = true }
    if (data.sourceEpisodeId !== undefined) { existing.sourceEpisodeId = data.sourceEpisodeId ?? null; changed = true }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  private generateId(): string {
    return `item_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
  /** 设定资产库导入回填血缘列（2026-09-24 P0）：库条目导入为项目行后记来源 */
  async applyLibraryLineage(
    id: string,
    data: { libraryWorldId?: string; libraryEntryId?: string; libraryVersion?: number },
  ): Promise<void> {
    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (data.libraryWorldId !== undefined) patch.libraryWorldId = data.libraryWorldId
    if (data.libraryEntryId !== undefined) patch.libraryEntryId = data.libraryEntryId
    if (data.libraryVersion !== undefined) patch.libraryVersion = data.libraryVersion
    await this.repo.update({ id } as any, patch as any)
  }

}
