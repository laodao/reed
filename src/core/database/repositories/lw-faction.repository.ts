/**
 * 势力仓库
 * @module database/repositories/lw-faction.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import { StoryFaction, FactionType } from '@shared/types/longwriting.types'
import { LwFactionEntity } from '../entities/lw-faction.entity'
import { BaseRepository } from '../base-repository'

export class LwFactionRepository extends BaseRepository<
  LwFactionEntity,
  StoryFaction
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwFactionEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: LwFactionEntity): StoryFaction {
    return {
      id: e.id,
      projectId: e.projectId,
      factionType: e.factionType as FactionType,
      name: e.name,
      locationId: e.locationId ?? undefined,
      description: e.description ?? '',
      sortOrder: e.sortOrder,
      libraryWorldId: e.libraryWorldId ?? undefined,
      libraryEntryId: e.libraryEntryId ?? undefined,
      libraryVersion: e.libraryVersion ?? undefined,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    } as StoryFaction
  }

  async getByProjectId(projectId: string): Promise<StoryFaction[]> {
    const entities = await this.repo
      .createQueryBuilder('f')
      .where('f.project_id = :pid', { pid: projectId })
      .orderBy('f.sort_order', 'ASC')
      .addOrderBy('f.created_at', 'DESC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getByProjectIdAndType(
    projectId: string,
    factionType: FactionType,
  ): Promise<StoryFaction[]> {
    const entities = await this.repo
      .createQueryBuilder('f')
      .where('f.project_id = :pid AND f.faction_type = :ft', { pid: projectId, ft: factionType })
      .orderBy('f.sort_order', 'ASC')
      .addOrderBy('f.created_at', 'DESC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getById(id: string): Promise<StoryFaction | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(data: {
    projectId: string
    factionType: FactionType
    name: string
    locationId?: string
    description: string
    sortOrder?: number
  }): Promise<StoryFaction> {
    const id = this.generateId()
    const now = new Date()
    const locationId = data.locationId && data.locationId.trim() !== '' ? data.locationId : null
    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      factionType: data.factionType,
      name: data.name,
      locationId,
      description: data.description,
      sortOrder: data.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: Partial<StoryFaction>,
  ): Promise<StoryFaction | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.factionType !== undefined) { existing.factionType = data.factionType; changed = true }
    if (data.name !== undefined) { existing.name = data.name; changed = true }
    if (data.locationId !== undefined) {
      existing.locationId =
        data.locationId && data.locationId.trim() !== '' ? data.locationId : null
      changed = true
    }
    if (data.description !== undefined) { existing.description = data.description; changed = true }
    if (data.sortOrder !== undefined) { existing.sortOrder = data.sortOrder; changed = true }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async updateSortOrder(
    orderList: { id: string; order: number }[],
  ): Promise<boolean> {
    if (orderList.length === 0) return true
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwFactionEntity)
      for (const item of orderList) {
        await repo.update({ id: item.id } as any, {
          sortOrder: item.order,
          updatedAt: new Date(),
        })
      }
    })
    return true
  }

  private generateId(): string {
    return `fac_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
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
    await this.scoped.update({ id } as any, patch as any)
  }

}
