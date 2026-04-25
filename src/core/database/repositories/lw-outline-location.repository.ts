/**
 * 大纲地点关联仓库
 * @module database/repositories/lw-outline-location.repository
 * 符合第三范式，替代JSON存储
 */

import Database from 'better-sqlite3'

/**
 * 大纲地点关联
 */
export interface OutlineLocationRelation {
  id: string
  outlineId: string
  locationId: string
  createdAt: number
}

/**
 * 大纲地点关联仓库
 */
export class LwOutlineLocationRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据大纲ID获取所有关联的地点ID
   */
  getLocationIdsByOutlineId(outlineId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT location_id FROM lw_outline_locations WHERE outline_id = ?
    `)
    const rows = stmt.all(outlineId) as any[]
    return rows.map(row => row.location_id)
  }

  /**
   * 根据地点ID获取所有关联的大纲ID
   */
  getOutlineIdsByLocationId(locationId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT outline_id FROM lw_outline_locations WHERE location_id = ?
    `)
    const rows = stmt.all(locationId) as any[]
    return rows.map(row => row.outline_id)
  }

  /**
   * 批量获取大纲的地点ID映射
   * @param outlineIds 大纲ID列表
   * @returns Map<outlineId, locationId[]>
   */
  getLocationIdsByOutlineIds(outlineIds: string[]): Map<string, string[]> {
    const result = new Map<string, string[]>()

    if (outlineIds.length === 0) return result

    const placeholders = outlineIds.map(() => '?').join(',')
    const stmt = this.db.prepare(`
      SELECT outline_id, location_id FROM lw_outline_locations WHERE outline_id IN (${placeholders})
    `)
    const rows = stmt.all(...outlineIds) as any[]

    for (const row of rows) {
      if (!result.has(row.outline_id)) {
        result.set(row.outline_id, [])
      }
      result.get(row.outline_id)!.push(row.location_id)
    }

    // 确保所有大纲都有条目
    for (const outlineId of outlineIds) {
      if (!result.has(outlineId)) {
        result.set(outlineId, [])
      }
    }

    return result
  }

  /**
   * 添加大纲地点关联
   */
  add(outlineId: string, locationId: string): OutlineLocationRelation {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_outline_locations (id, outline_id, location_id, created_at)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(id, outlineId, locationId, now)

    return { id, outlineId, locationId, createdAt: now }
  }

  /**
   * 批量添加大纲地点关联（事务）
   */
  batchAdd(outlineId: string, locationIds: string[]): void {
    if (locationIds.length === 0) return

    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_outline_locations (id, outline_id, location_id, created_at)
      VALUES (?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      for (const locationId of locationIds) {
        const id = this.generateId()
        stmt.run(id, outlineId, locationId, now)
      }
    })

    transaction()
  }

  /**
   * 替换大纲的所有地点关联
   */
  replaceAll(outlineId: string, locationIds: string[]): void {
    const transaction = this.db.transaction(() => {
      // 先删除现有关联
      this.deleteByOutlineId(outlineId)
      // 再添加新关联
      this.batchAdd(outlineId, locationIds)
    })
    transaction()
  }

  /**
   * 删除大纲地点关联
   */
  delete(outlineId: string, locationId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM lw_outline_locations WHERE outline_id = ? AND location_id = ?
    `)
    const result = stmt.run(outlineId, locationId)
    return result.changes > 0
  }

  /**
   * 删除大纲的所有地点关联
   */
  deleteByOutlineId(outlineId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_outline_locations WHERE outline_id = ?')
    const result = stmt.run(outlineId)
    return result.changes
  }

  /**
   * 删除地点的所有大纲关联
   */
  deleteByLocationId(locationId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_outline_locations WHERE location_id = ?')
    const result = stmt.run(locationId)
    return result.changes
  }

  /**
   * 迁移：从JSON字段迁移到关联表
   * 大纲表中存储的是地点ID数组，直接迁移即可
   */
  migrateFromJson(projectId: string): number {
    // 获取项目的所有大纲
    const stmt = this.db.prepare(`
      SELECT id, involved_locations FROM lw_story_outlines WHERE project_id = ?
    `)
    const outlines = stmt.all(projectId) as any[]

    let migratedCount = 0
    const now = Date.now()
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_outline_locations (id, outline_id, location_id, created_at)
      VALUES (?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      for (const outline of outlines) {
        const locationIds: string[] = this.parseJsonArray(outline.involved_locations)
        for (const locationId of locationIds) {
          const id = this.generateId()
          insertStmt.run(id, outline.id, locationId, now)
          migratedCount++
        }
      }
    })

    transaction()
    return migratedCount
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `ol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 解析JSON数组
   */
  private parseJsonArray(jsonStr: string | null): string[] {
    if (!jsonStr) return []
    try {
      return JSON.parse(jsonStr)
    } catch {
      return []
    }
  }
}