/**
 * 长文写作故事记忆仓库
 * @module database/repositories/lw-memory.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, type DataSource } from 'typeorm'
import {
  StoryMemory,
  MemoryEntity,
  MemoryType,
  MemoryImportance,
  CreateMemoryRequest,
  UpdateMemoryRequest,
} from '@shared/types/longwriting.types'
import { LwMemoryEntity } from '../entities/lw-memory.entity'
import { LwMemoryEntityRepository } from './lw-memory-entity.repository'
import { BaseRepository } from '../base-repository'

export class LwMemoryRepository extends BaseRepository<LwMemoryEntity, StoryMemory> {
  private memoryEntityRepo: LwMemoryEntityRepository

  constructor(dataSource: DataSource) {
    super(dataSource, LwMemoryEntity)
    this.memoryEntityRepo = new LwMemoryEntityRepository(dataSource)
  }

  protected toDto(e: LwMemoryEntity): StoryMemory {
    return {
      id: e.id,
      projectId: e.projectId,
      sourceOutlineId: e.sourceOutlineId ?? undefined,
      memoryType: e.memoryType as MemoryType,
      title: e.title,
      description: e.description ?? '',
      involvedEntities: this.parseEntities(e.involvedEntities),
      chapterNumber: e.chapterNumber ?? 0,
      importance: (e.importance || 'normal') as MemoryImportance,
      isActive: e.isActive === 1,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async getByProjectId(projectId: string): Promise<StoryMemory[]> {
    const rows = await this.repo
      .createQueryBuilder('m')
      .where('m.project_id = :pid', { pid: projectId })
      .orderBy('m.chapter_number', 'ASC')
      .addOrderBy('m.created_at', 'ASC')
      .getMany()
    return this.toDtoList(rows)
  }

  async getMemoriesBeforeChapter(
    projectId: string,
    chapterNumber: number,
  ): Promise<StoryMemory[]> {
    const rows = await this.repo
      .createQueryBuilder('m')
      .where('m.project_id = :pid', { pid: projectId })
      .andWhere('m.chapter_number < :cn', { cn: chapterNumber })
      .andWhere('m.is_active = 1')
      .orderBy('m.chapter_number', 'ASC')
      .addOrderBy('m.importance', 'DESC')
      .addOrderBy('m.created_at', 'ASC')
      .getMany()
    return this.toDtoList(rows)
  }

  async getMemoriesByChapter(
    projectId: string,
    chapterNumber: number,
  ): Promise<StoryMemory[]> {
    const rows = await this.repo
      .createQueryBuilder('m')
      .where('m.project_id = :pid', { pid: projectId })
      .andWhere('m.chapter_number = :cn', { cn: chapterNumber })
      .orderBy('m.importance', 'DESC')
      .addOrderBy('m.created_at', 'ASC')
      .getMany()
    return this.toDtoList(rows)
  }

  async getById(id: string): Promise<StoryMemory | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getBySourceOutlineId(outlineId: string): Promise<StoryMemory[]> {
    return this.findManyByWhere({ sourceOutlineId: outlineId } as any)
  }

  async getMemoriesByEntity(
    projectId: string,
    entityType: MemoryEntity['type'],
    entityId: string,
  ): Promise<StoryMemory[]> {
    const memoryIds = await this.memoryEntityRepo.getMemoryIdsByEntity(entityType, entityId)
    if (memoryIds.length === 0) return []
    const rows = await this.repo
      .createQueryBuilder('m')
      .where('m.project_id = :pid', { pid: projectId })
      .andWhere('m.id IN (:...ids)', { ids: memoryIds })
      .orderBy('m.chapter_number', 'ASC')
      .addOrderBy('m.created_at', 'ASC')
      .getMany()
    return this.toDtoList(rows)
  }

  async create(data: CreateMemoryRequest): Promise<StoryMemory> {
    const id = this.generateId()
    const now = Date.now()

    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      sourceOutlineId: data.sourceOutlineId ?? null,
      memoryType: data.memoryType,
      title: data.title,
      description: data.description,
      involvedEntities: JSON.stringify(data.involvedEntities || []),
      chapterNumber: data.chapterNumber,
      importance: data.importance || 'normal',
      isActive: 1,
      createdAt: now,
      updatedAt: now,
    })
    await this.scoped.save(entity)

    if (data.involvedEntities && data.involvedEntities.length > 0) {
      await this.memoryEntityRepo.batchAdd(id, data.involvedEntities)
    }

    return {
      id,
      projectId: data.projectId,
      sourceOutlineId: data.sourceOutlineId,
      memoryType: data.memoryType,
      title: data.title,
      description: data.description,
      involvedEntities: data.involvedEntities || [],
      chapterNumber: data.chapterNumber,
      importance: data.importance || 'normal',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }
  }

  async batchCreate(dataList: CreateMemoryRequest[]): Promise<StoryMemory[]> {
    if (dataList.length === 0) return []
    const results: StoryMemory[] = []
    await this.dataSource.transaction(async () => {
      for (const data of dataList) {
        results.push(await this.create(data))
      }
    })
    return results
  }

  async update(id: string, data: UpdateMemoryRequest): Promise<StoryMemory | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.title !== undefined) {
      existing.title = data.title
      changed = true
    }
    if (data.description !== undefined) {
      existing.description = data.description
      changed = true
    }
    if (data.involvedEntities !== undefined) {
      existing.involvedEntities = JSON.stringify(data.involvedEntities)
      changed = true
    }
    if (data.importance !== undefined) {
      existing.importance = data.importance
      changed = true
    }
    if (data.isActive !== undefined) {
      existing.isActive = data.isActive ? 1 : 0
      changed = true
    }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = Date.now()
    await this.scoped.save(existing)

    if (data.involvedEntities !== undefined) {
      await this.memoryEntityRepo.replaceAll(id, data.involvedEntities)
    }

    return this.getById(id)
  }

  async toggleActive(id: string): Promise<StoryMemory | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null
    existing.isActive = existing.isActive === 1 ? 0 : 1
    existing.updatedAt = Date.now()
    await this.scoped.save(existing)
    return this.toDto(existing)
  }

  async delete(id: string): Promise<boolean> {
    await this.memoryEntityRepo.deleteByMemoryId(id)
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteBySourceOutlineId(outlineId: string): Promise<number> {
    const rows = await this.scoped.find({
      where: { sourceOutlineId: outlineId } as any,
      select: ['id'],
    })
    for (const r of rows) {
      await this.memoryEntityRepo.deleteByMemoryId(r.id)
    }
    return this.scoped.delete({ sourceOutlineId: outlineId } as any)
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    const rows = await this.scoped.find({
      where: { projectId } as any,
      select: ['id'],
    })
    for (const r of rows) {
      await this.memoryEntityRepo.deleteByMemoryId(r.id)
    }
    return this.scoped.delete({ projectId } as any)
  }

  async getEntities(memoryId: string): Promise<MemoryEntity[]> {
    return this.memoryEntityRepo.getEntitiesByMemoryId(memoryId)
  }

  async updateEntityRelations(
    memoryId: string,
    entities: MemoryEntity[],
  ): Promise<void> {
    await this.memoryEntityRepo.replaceAll(memoryId, entities)
  }

  async getEntitiesByMemoryIds(
    memoryIds: string[],
  ): Promise<Map<string, MemoryEntity[]>> {
    return this.memoryEntityRepo.getEntitiesByMemoryIds(memoryIds)
  }

  async getMemoryStats(projectId: string): Promise<{
    total: number
    active: number
    byType: Record<MemoryType, number>
    byImportance: Record<MemoryImportance, number>
  }> {
    const memories = await this.getByProjectId(projectId)

    const stats = {
      total: memories.length,
      active: memories.filter(m => m.isActive).length,
      byType: {
        character_event: 0,
        location_event: 0,
        item_event: 0,
        relationship_change: 0,
        faction_event: 0,
        skill_event: 0,
        general: 0,
      } as Record<MemoryType, number>,
      byImportance: {
        critical: 0,
        normal: 0,
        minor: 0,
      } as Record<MemoryImportance, number>,
    }

    for (const memory of memories) {
      stats.byType[memory.memoryType]++
      stats.byImportance[memory.importance]++
    }

    return stats
  }

  async migrateToRelationTables(projectId: string): Promise<number> {
    const memories = await this.getByProjectId(projectId)
    let migratedCount = 0
    for (const memory of memories) {
      if (memory.involvedEntities && memory.involvedEntities.length > 0) {
        await this.memoryEntityRepo.replaceAll(memory.id, memory.involvedEntities)
        migratedCount += memory.involvedEntities.length
      }
    }
    return migratedCount
  }

  private generateId(): string {
    return `memory_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  private parseEntities(jsonStr: string | null): MemoryEntity[] {
    if (!jsonStr) return []
    try {
      return JSON.parse(jsonStr)
    } catch {
      return []
    }
  }
}
