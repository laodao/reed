/**
 * 记忆实体关联仓库
 * @module database/repositories/lw-memory-entity.repository
 * 符合第三范式，替代JSON存储
 */

import Database from 'better-sqlite3'
import { MemoryEntity } from '@shared/types/longwriting.types'

/**
 * 记忆实体关联仓库
 */
export class LwMemoryEntityRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据记忆ID获取所有关联的实体
   */
  getEntitiesByMemoryId(memoryId: string): MemoryEntity[] {
    const stmt = this.db.prepare(`
      SELECT entity_type, entity_id, entity_name FROM lw_memory_entities WHERE memory_id = ?
    `)
    const rows = stmt.all(memoryId) as any[]
    return rows.map(row => ({
      type: row.entity_type as MemoryEntity['type'],
      id: row.entity_id,
      name: row.entity_name
    }))
  }

  /**
   * 根据实体查询相关记忆ID
   */
  getMemoryIdsByEntity(entityType: MemoryEntity['type'], entityId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT memory_id FROM lw_memory_entities WHERE entity_type = ? AND entity_id = ?
    `)
    const rows = stmt.all(entityType, entityId) as any[]
    return rows.map(row => row.memory_id)
  }

  /**
   * 批量获取记忆的实体映射
   * @param memoryIds 记忆ID列表
   * @returns Map<memoryId, MemoryEntity[]>
   */
  getEntitiesByMemoryIds(memoryIds: string[]): Map<string, MemoryEntity[]> {
    const result = new Map<string, MemoryEntity[]>()

    if (memoryIds.length === 0) return result

    const placeholders = memoryIds.map(() => '?').join(',')
    const stmt = this.db.prepare(`
      SELECT memory_id, entity_type, entity_id, entity_name FROM lw_memory_entities WHERE memory_id IN (${placeholders})
    `)
    const rows = stmt.all(...memoryIds) as any[]

    for (const row of rows) {
      if (!result.has(row.memory_id)) {
        result.set(row.memory_id, [])
      }
      result.get(row.memory_id)!.push({
        type: row.entity_type as MemoryEntity['type'],
        id: row.entity_id,
        name: row.entity_name
      })
    }

    // 确保所有记忆都有条目
    for (const memoryId of memoryIds) {
      if (!result.has(memoryId)) {
        result.set(memoryId, [])
      }
    }

    return result
  }

  /**
   * 添加记忆实体关联
   */
  add(memoryId: string, entity: MemoryEntity): void {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_memory_entities (id, memory_id, entity_type, entity_id, entity_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, memoryId, entity.type, entity.id, entity.name, now)
  }

  /**
   * 批量添加记忆实体关联（事务）
   */
  batchAdd(memoryId: string, entities: MemoryEntity[]): void {
    if (entities.length === 0) return

    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_memory_entities (id, memory_id, entity_type, entity_id, entity_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      for (const entity of entities) {
        const id = this.generateId()
        stmt.run(id, memoryId, entity.type, entity.id, entity.name, now)
      }
    })

    transaction()
  }

  /**
   * 替换记忆的所有实体关联
   */
  replaceAll(memoryId: string, entities: MemoryEntity[]): void {
    const transaction = this.db.transaction(() => {
      // 先删除现有关联
      this.deleteByMemoryId(memoryId)
      // 再添加新关联
      this.batchAdd(memoryId, entities)
    })
    transaction()
  }

  /**
   * 删除记忆实体关联
   */
  delete(memoryId: string, entityType: MemoryEntity['type'], entityId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM lw_memory_entities WHERE memory_id = ? AND entity_type = ? AND entity_id = ?
    `)
    const result = stmt.run(memoryId, entityType, entityId)
    return result.changes > 0
  }

  /**
   * 删除记忆的所有实体关联
   */
  deleteByMemoryId(memoryId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_memory_entities WHERE memory_id = ?')
    const result = stmt.run(memoryId)
    return result.changes
  }

  /**
   * 删除实体的所有记忆关联
   */
  deleteByEntity(entityType: MemoryEntity['type'], entityId: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM lw_memory_entities WHERE entity_type = ? AND entity_id = ?
    `)
    const result = stmt.run(entityType, entityId)
    return result.changes
  }

  /**
   * 迁移：从JSON字段迁移到关联表
   */
  migrateFromJson(memoryId: string): number {
    // 获取记忆的实体JSON
    const stmt = this.db.prepare(`
      SELECT involved_entities FROM lw_story_memories WHERE id = ?
    `)
    const result = stmt.get(memoryId) as any

    if (!result?.involved_entities) return 0

    const entities: MemoryEntity[] = this.parseJsonEntities(result.involved_entities)
    if (entities.length === 0) return 0

    this.batchAdd(memoryId, entities)
    return entities.length
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `me_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 解析JSON实体数组
   */
  private parseJsonEntities(jsonStr: string | null): MemoryEntity[] {
    if (!jsonStr) return []
    try {
      return JSON.parse(jsonStr)
    } catch {
      return []
    }
  }
}