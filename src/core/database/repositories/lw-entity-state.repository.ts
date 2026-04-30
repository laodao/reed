/**
 * 长文写作实体状态快照仓库
 * @module database/repositories/lw-entity-state.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  EntityStateSnapshot,
  EntityType,
  CreateEntityStateSnapshotRequest,
  UpdateEntityStateSnapshotRequest,
  SnapshotStats,
} from '@shared/types/longwriting.types'
import { LwEntityStateEntity } from '../entities/lw-entity-state.entity'
import { BaseRepository } from '../base-repository'

export class LwEntityStateRepository extends BaseRepository<
  LwEntityStateEntity,
  EntityStateSnapshot
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwEntityStateEntity)
  }

  protected toDto(e: LwEntityStateEntity): EntityStateSnapshot {
    return {
      id: e.id,
      projectId: e.projectId,
      entityType: e.entityType as EntityType,
      entityId: e.entityId,
      entityName: e.entityName,
      chapterNumber: e.chapterNumber,
      stateSummary: e.stateSummary,
      keyChanges: this.parseKeyChanges(e.keyChanges),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async getByProjectId(projectId: string): Promise<EntityStateSnapshot[]> {
    const rows = await this.repo
      .createQueryBuilder('s')
      .where('s.project_id = :pid', { pid: projectId })
      .orderBy('s.chapter_number', 'ASC')
      .addOrderBy('s.entity_type', 'ASC')
      .addOrderBy('s.created_at', 'ASC')
      .getMany()
    return this.toDtoList(rows)
  }

  async getEntityStateAtChapter(
    projectId: string,
    entityType: EntityType,
    entityId: string,
    chapterNumber: number,
  ): Promise<EntityStateSnapshot | null> {
    const row = await this.repo
      .createQueryBuilder('s')
      .where('s.project_id = :pid', { pid: projectId })
      .andWhere('s.entity_type = :et', { et: entityType })
      .andWhere('s.entity_id = :eid', { eid: entityId })
      .andWhere('s.chapter_number <= :cn', { cn: chapterNumber })
      .orderBy('s.chapter_number', 'DESC')
      .limit(1)
      .getOne()
    return row ? this.toDto(row) : null
  }

  async getEntitiesStatesForChapter(
    projectId: string,
    chapterNumber: number,
    entities: Array<{ entityType: EntityType; entityId: string }>,
  ): Promise<EntityStateSnapshot[]> {
    const results: EntityStateSnapshot[] = []
    for (const entity of entities) {
      const state = await this.getEntityStateAtChapter(
        projectId,
        entity.entityType,
        entity.entityId,
        chapterNumber,
      )
      if (state) results.push(state)
    }
    return results
  }

  async getByChapterNumber(
    projectId: string,
    chapterNumber: number,
  ): Promise<EntityStateSnapshot[]> {
    const rows = await this.repo
      .createQueryBuilder('s')
      .where('s.project_id = :pid', { pid: projectId })
      .andWhere('s.chapter_number = :cn', { cn: chapterNumber })
      .orderBy('s.entity_type', 'ASC')
      .addOrderBy('s.created_at', 'ASC')
      .getMany()
    return this.toDtoList(rows)
  }

  async getById(id: string): Promise<EntityStateSnapshot | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getLatestEntityState(
    projectId: string,
    entityType: EntityType,
    entityId: string,
  ): Promise<EntityStateSnapshot | null> {
    const row = await this.repo
      .createQueryBuilder('s')
      .where('s.project_id = :pid', { pid: projectId })
      .andWhere('s.entity_type = :et', { et: entityType })
      .andWhere('s.entity_id = :eid', { eid: entityId })
      .orderBy('s.chapter_number', 'DESC')
      .limit(1)
      .getOne()
    return row ? this.toDto(row) : null
  }

  async create(data: CreateEntityStateSnapshotRequest): Promise<EntityStateSnapshot> {
    const id = this.generateId()
    const now = Date.now()

    await this.repo.save(
      this.repo.create({
        id,
        projectId: data.projectId,
        entityType: data.entityType,
        entityId: data.entityId,
        entityName: data.entityName,
        chapterNumber: data.chapterNumber,
        stateSummary: data.stateSummary,
        keyChanges: JSON.stringify(data.keyChanges || []),
        createdAt: now,
        updatedAt: now,
      }),
    )

    return {
      id,
      projectId: data.projectId,
      entityType: data.entityType,
      entityId: data.entityId,
      entityName: data.entityName,
      chapterNumber: data.chapterNumber,
      stateSummary: data.stateSummary,
      keyChanges: data.keyChanges || [],
      createdAt: now,
      updatedAt: now,
    }
  }

  async batchCreate(
    dataList: CreateEntityStateSnapshotRequest[],
  ): Promise<EntityStateSnapshot[]> {
    if (dataList.length === 0) return []
    const results: EntityStateSnapshot[] = []
    await this.dataSource.transaction(async () => {
      for (const data of dataList) {
        results.push(await this.upsert(data))
      }
    })
    return results
  }

  async update(
    id: string,
    data: UpdateEntityStateSnapshotRequest,
  ): Promise<EntityStateSnapshot | null> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return null

    let changed = false
    if (data.stateSummary !== undefined) {
      existing.stateSummary = data.stateSummary
      changed = true
    }
    if (data.keyChanges !== undefined) {
      existing.keyChanges = JSON.stringify(data.keyChanges)
      changed = true
    }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = Date.now()
    await this.repo.save(existing)
    return this.toDto(existing)
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async deleteByChapterNumber(projectId: string, chapterNumber: number): Promise<number> {
    const result = await this.repo.delete({ projectId, chapterNumber } as any)
    return result.affected ?? 0
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    const result = await this.repo.delete({ projectId } as any)
    return result.affected ?? 0
  }

  async getSnapshotStats(projectId: string): Promise<SnapshotStats> {
    const snapshots = await this.getByProjectId(projectId)
    const stats: SnapshotStats = {
      total: snapshots.length,
      byEntityType: {
        character: 0,
        location: 0,
        item: 0,
        faction: 0,
        skill: 0,
      },
      byChapter: {},
    }
    for (const s of snapshots) {
      stats.byEntityType[s.entityType]++
      if (!stats.byChapter[s.chapterNumber]) stats.byChapter[s.chapterNumber] = 0
      stats.byChapter[s.chapterNumber]++
    }
    return stats
  }

  async upsert(data: CreateEntityStateSnapshotRequest): Promise<EntityStateSnapshot> {
    const existing = await this.repo.findOne({
      where: {
        projectId: data.projectId,
        entityType: data.entityType,
        entityId: data.entityId,
        chapterNumber: data.chapterNumber,
      } as any,
    })

    if (existing) {
      existing.stateSummary = data.stateSummary
      existing.keyChanges = JSON.stringify(data.keyChanges || [])
      existing.entityName = data.entityName
      existing.updatedAt = Date.now()
      await this.repo.save(existing)
      return this.toDto(existing)
    }
    return this.create(data)
  }

  private generateId(): string {
    return `entity_state_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  private parseKeyChanges(jsonStr: string | null): string[] {
    if (!jsonStr) return []
    try {
      return JSON.parse(jsonStr)
    } catch {
      return []
    }
  }
}
