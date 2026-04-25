/**
 * 长文写作故事记忆仓库
 * @module database/repositories/lw-memory.repository
 */

import Database from 'better-sqlite3'
import {
  StoryMemory,
  MemoryEntity,
  MemoryType,
  MemoryImportance,
  CreateMemoryRequest,
  UpdateMemoryRequest
} from '@shared/types/longwriting.types'
import { LwMemoryEntityRepository } from './lw-memory-entity.repository'

export class LwMemoryRepository {
  private memoryEntityRepo: LwMemoryEntityRepository

  constructor(private db: Database.Database) {
    this.memoryEntityRepo = new LwMemoryEntityRepository(db)
  }

  /**
   * 根据项目 ID 获取所有记忆
   */
  getByProjectId(projectId: string): StoryMemory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_memories WHERE project_id = ? ORDER BY chapter_number ASC, created_at ASC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(row => this.mapToMemory(row))
  }

  /**
   * 获取项目指定章节之前的所有生效记忆
   */
  getMemoriesBeforeChapter(projectId: string, chapterNumber: number): StoryMemory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_memories
      WHERE project_id = ? AND chapter_number < ? AND is_active = 1
      ORDER BY chapter_number ASC, importance DESC, created_at ASC
    `)
    const rows = stmt.all(projectId, chapterNumber) as any[]
    return rows.map(row => this.mapToMemory(row))
  }

  /**
   * 获取指定章节的记忆
   */
  getMemoriesByChapter(projectId: string, chapterNumber: number): StoryMemory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_memories
      WHERE project_id = ? AND chapter_number = ?
      ORDER BY importance DESC, created_at ASC
    `)
    const rows = stmt.all(projectId, chapterNumber) as any[]
    return rows.map(row => this.mapToMemory(row))
  }

  /**
   * 根据 ID 获取记忆
   */
  getById(id: string): StoryMemory | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_memories WHERE id = ?
    `)
    const row = stmt.get(id) as any
    return row ? this.mapToMemory(row) : null
  }

  /**
   * 根据来源大纲 ID 获取记忆
   */
  getBySourceOutlineId(outlineId: string): StoryMemory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_memories WHERE source_outline_id = ?
    `)
    const rows = stmt.all(outlineId) as any[]
    return rows.map(row => this.mapToMemory(row))
  }

  /**
   * 根据实体查询记忆
   */
  getMemoriesByEntity(projectId: string, entityType: MemoryEntity['type'], entityId: string): StoryMemory[] {
    const memoryIds = this.memoryEntityRepo.getMemoryIdsByEntity(entityType, entityId)
    if (memoryIds.length === 0) return []

    const placeholders = memoryIds.map(() => '?').join(',')
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_memories
      WHERE project_id = ? AND id IN (${placeholders})
      ORDER BY chapter_number ASC, created_at ASC
    `)
    const rows = stmt.all(projectId, ...memoryIds) as any[]
    return rows.map(row => this.mapToMemory(row))
  }

  /**
   * 创建记忆
   */
  create(data: CreateMemoryRequest): StoryMemory {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO lw_story_memories (
        id, project_id, source_outline_id, memory_type, title, description,
        involved_entities, chapter_number, importance, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `)

    // 保留JSON字段以兼容
    stmt.run(
      id,
      data.projectId,
      data.sourceOutlineId || null,
      data.memoryType,
      data.title,
      data.description,
      JSON.stringify(data.involvedEntities || []),
      data.chapterNumber,
      data.importance || 'normal',
      now,
      now
    )

    // 同时写入关联表
    if (data.involvedEntities && data.involvedEntities.length > 0) {
      this.memoryEntityRepo.batchAdd(id, data.involvedEntities)
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
      updatedAt: now
    }
  }

  /**
   * 批量创建记忆
   */
  batchCreate(dataList: CreateMemoryRequest[]): StoryMemory[] {
    const results: StoryMemory[] = []
    const transaction = this.db.transaction(() => {
      for (const data of dataList) {
        const memory = this.create(data)
        results.push(memory)
      }
    })
    transaction()
    return results
  }

  /**
   * 更新记忆
   */
  update(id: string, data: UpdateMemoryRequest): StoryMemory | null {
    const memory = this.getById(id)
    if (!memory) return null

    const now = Date.now()
    const updates: string[] = []
    const values: any[] = []

    if (data.title !== undefined) {
      updates.push('title = ?')
      values.push(data.title)
    }
    if (data.description !== undefined) {
      updates.push('description = ?')
      values.push(data.description)
    }
    if (data.involvedEntities !== undefined) {
      updates.push('involved_entities = ?')
      values.push(JSON.stringify(data.involvedEntities))
    }
    if (data.importance !== undefined) {
      updates.push('importance = ?')
      values.push(data.importance)
    }
    if (data.isActive !== undefined) {
      updates.push('is_active = ?')
      values.push(data.isActive ? 1 : 0)
    }

    if (updates.length === 0) return memory

    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_story_memories SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    // 更新关联表
    if (data.involvedEntities !== undefined) {
      this.memoryEntityRepo.replaceAll(id, data.involvedEntities)
    }

    return this.getById(id)
  }

  /**
   * 切换记忆生效状态
   */
  toggleActive(id: string): StoryMemory | null {
    const memory = this.getById(id)
    if (!memory) return null

    const now = Date.now()
    const stmt = this.db.prepare(`
      UPDATE lw_story_memories SET is_active = ?, updated_at = ? WHERE id = ?
    `)
    stmt.run(memory.isActive ? 0 : 1, now, id)

    return this.getById(id)
  }

  /**
   * 删除记忆
   */
  delete(id: string): boolean {
    // 先删除关联数据
    this.memoryEntityRepo.deleteByMemoryId(id)

    const stmt = this.db.prepare('DELETE FROM lw_story_memories WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 根据来源大纲 ID 删除记忆
   */
  deleteBySourceOutlineId(outlineId: string): number {
    // 获取所有记忆ID
    const memories = this.getBySourceOutlineId(outlineId)
    for (const memory of memories) {
      this.memoryEntityRepo.deleteByMemoryId(memory.id)
    }

    const stmt = this.db.prepare('DELETE FROM lw_story_memories WHERE source_outline_id = ?')
    const result = stmt.run(outlineId)
    return result.changes
  }

  /**
   * 删除项目的所有记忆
   */
  deleteByProjectId(projectId: string): number {
    // 获取所有记忆ID并删除关联数据
    const memories = this.getByProjectId(projectId)
    for (const memory of memories) {
      this.memoryEntityRepo.deleteByMemoryId(memory.id)
    }

    const stmt = this.db.prepare('DELETE FROM lw_story_memories WHERE project_id = ?')
    const result = stmt.run(projectId)
    return result.changes
  }

  /**
   * 获取记忆涉及的实体列表（从关联表）
   */
  getEntities(memoryId: string): MemoryEntity[] {
    return this.memoryEntityRepo.getEntitiesByMemoryId(memoryId)
  }

  /**
   * 更新记忆的实体关联
   */
  updateEntityRelations(memoryId: string, entities: MemoryEntity[]): void {
    this.memoryEntityRepo.replaceAll(memoryId, entities)
  }

  /**
   * 批量获取记忆的实体映射
   */
  getEntitiesByMemoryIds(memoryIds: string[]): Map<string, MemoryEntity[]> {
    return this.memoryEntityRepo.getEntitiesByMemoryIds(memoryIds)
  }

  /**
   * 获取项目的记忆统计
   */
  getMemoryStats(projectId: string): {
    total: number
    active: number
    byType: Record<MemoryType, number>
    byImportance: Record<MemoryImportance, number>
  } {
    const memories = this.getByProjectId(projectId)

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
        general: 0
      } as Record<MemoryType, number>,
      byImportance: {
        critical: 0,
        normal: 0,
        minor: 0
      } as Record<MemoryImportance, number>
    }

    for (const memory of memories) {
      stats.byType[memory.memoryType]++
      stats.byImportance[memory.importance]++
    }

    return stats
  }

  /**
   * 迁移现有数据到关联表
   */
  migrateToRelationTables(projectId: string): number {
    const memories = this.getByProjectId(projectId)
    let migratedCount = 0

    for (const memory of memories) {
      if (memory.involvedEntities && memory.involvedEntities.length > 0) {
        this.memoryEntityRepo.replaceAll(memory.id, memory.involvedEntities)
        migratedCount += memory.involvedEntities.length
      }
    }

    return migratedCount
  }

  private generateId(): string {
    return `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private mapToMemory(row: any): StoryMemory {
    return {
      id: row.id,
      projectId: row.project_id,
      sourceOutlineId: row.source_outline_id || undefined,
      memoryType: row.memory_type as MemoryType,
      title: row.title,
      description: row.description || '',
      involvedEntities: this.parseEntities(row.involved_entities),
      chapterNumber: row.chapter_number || 0,
      importance: (row.importance || 'normal') as MemoryImportance,
      isActive: !!row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
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