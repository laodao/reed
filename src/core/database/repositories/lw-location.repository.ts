/**
 * 地点仓库
 * @module database/repositories/lw-location.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  StoryLocation,
  LocationType,
  LocationImportance,
  EntityImportance,
  TemporaryLocationTemplateType,
  EntitySourceType,
} from '@shared/types/longwriting.types'
import { LwLocationEntity } from '../entities/lw-location.entity'
import { BaseRepository } from '../base-repository'

export class LwLocationRepository extends BaseRepository<
  LwLocationEntity,
  StoryLocation
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwLocationEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: LwLocationEntity): StoryLocation {
    return {
      id: e.id,
      projectId: e.projectId,
      name: e.name,
      type: e.type as LocationType,
      description: e.description ?? '',
      importance: e.importance as LocationImportance,
      entityImportance: (e.entityImportance as EntityImportance) || 'secondary',
      templateType: (e.templateType as TemporaryLocationTemplateType | null) ?? undefined,
      // generatedImageId 已从 entity 移除（数据在 asset_image）
      mapId: e.mapId ?? undefined,
      sourceType: (e.sourceType as EntitySourceType) || 'longwriting',
      sourceEpisodeId: e.sourceEpisodeId ?? undefined,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    } as StoryLocation
  }

  async getByProjectId(projectId: string): Promise<StoryLocation[]> {
    return this.findManyByWhere({ projectId } as any, { createdAt: 'DESC' })
  }

  async getTemporaryByProjectId(projectId: string): Promise<StoryLocation[]> {
    return this.findManyByWhere(
      { projectId, entityImportance: 'temporary' } as any,
      { createdAt: 'DESC' },
    )
  }

  async getById(id: string): Promise<StoryLocation | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getBySourceEpisodeId(episodeId: string): Promise<StoryLocation[]> {
    return this.findManyByWhere(
      { sourceEpisodeId: episodeId } as any,
      { createdAt: 'DESC' },
    )
  }

  async create(data: {
    projectId: string
    name: string
    type: LocationType
    importance: LocationImportance
    entityImportance?: EntityImportance
    templateType?: TemporaryLocationTemplateType
    /** @deprecated generatedImageId 已从 entity 移除，写入会被忽略；数据应写 asset_image 表 */
    generatedImageId?: string
    description: string
    mapId?: string
    sourceType?: EntitySourceType
    sourceEpisodeId?: string
  }): Promise<StoryLocation> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      name: data.name,
      type: data.type,
      description: data.description,
      importance: data.importance,
      entityImportance: data.entityImportance || 'secondary',
      templateType: data.templateType ?? null,
      // generatedImageId 已从 entity 移除，create 时忽略
      mapId: data.mapId ?? null,
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
    data: Partial<StoryLocation>,
  ): Promise<StoryLocation | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.name !== undefined) { existing.name = data.name; changed = true }
    if (data.type !== undefined) { existing.type = data.type; changed = true }
    if (data.description !== undefined) { existing.description = data.description; changed = true }
    if (data.importance !== undefined) { existing.importance = data.importance; changed = true }
    if (data.entityImportance !== undefined) { existing.entityImportance = data.entityImportance; changed = true }
    if (data.templateType !== undefined) { existing.templateType = data.templateType ?? null; changed = true }
    // generatedImageId 已从 entity 移除，update 时忽略
    if (data.mapId !== undefined) { existing.mapId = data.mapId ?? null; changed = true }
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
    return `loc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
