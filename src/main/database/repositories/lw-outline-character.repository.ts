/**
 * 大纲角色关联仓库
 * @module database/repositories/lw-outline-character.repository
 * 符合第三范式，替代JSON存储
 */

import Database from 'better-sqlite3'

/**
 * 大纲角色关联
 */
export interface OutlineCharacterRelation {
  id: string
  outlineId: string
  characterId: string
  createdAt: number
}

/**
 * 大纲角色关联仓库
 */
export class LwOutlineCharacterRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据大纲ID获取所有关联的角色ID
   */
  getCharacterIdsByOutlineId(outlineId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT character_id FROM lw_outline_characters WHERE outline_id = ?
    `)
    const rows = stmt.all(outlineId) as any[]
    return rows.map(row => row.character_id)
  }

  /**
   * 根据角色ID获取所有关联的大纲ID
   */
  getOutlineIdsByCharacterId(characterId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT outline_id FROM lw_outline_characters WHERE character_id = ?
    `)
    const rows = stmt.all(characterId) as any[]
    return rows.map(row => row.outline_id)
  }

  /**
   * 批量获取大纲的角色ID映射
   * @param outlineIds 大纲ID列表
   * @returns Map<outlineId, characterId[]>
   */
  getCharacterIdsByOutlineIds(outlineIds: string[]): Map<string, string[]> {
    const result = new Map<string, string[]>()

    if (outlineIds.length === 0) return result

    const placeholders = outlineIds.map(() => '?').join(',')
    const stmt = this.db.prepare(`
      SELECT outline_id, character_id FROM lw_outline_characters WHERE outline_id IN (${placeholders})
    `)
    const rows = stmt.all(...outlineIds) as any[]

    for (const row of rows) {
      if (!result.has(row.outline_id)) {
        result.set(row.outline_id, [])
      }
      result.get(row.outline_id)!.push(row.character_id)
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
   * 添加大纲角色关联
   */
  add(outlineId: string, characterId: string): OutlineCharacterRelation {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_outline_characters (id, outline_id, character_id, created_at)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(id, outlineId, characterId, now)

    return { id, outlineId, characterId, createdAt: now }
  }

  /**
   * 批量添加大纲角色关联（事务）
   */
  batchAdd(outlineId: string, characterIds: string[]): void {
    if (characterIds.length === 0) return

    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_outline_characters (id, outline_id, character_id, created_at)
      VALUES (?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      for (const characterId of characterIds) {
        const id = this.generateId()
        stmt.run(id, outlineId, characterId, now)
      }
    })

    transaction()
  }

  /**
   * 替换大纲的所有角色关联
   */
  replaceAll(outlineId: string, characterIds: string[]): void {
    const transaction = this.db.transaction(() => {
      // 先删除现有关联
      this.deleteByOutlineId(outlineId)
      // 再添加新关联
      this.batchAdd(outlineId, characterIds)
    })
    transaction()
  }

  /**
   * 删除大纲角色关联
   */
  delete(outlineId: string, characterId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM lw_outline_characters WHERE outline_id = ? AND character_id = ?
    `)
    const result = stmt.run(outlineId, characterId)
    return result.changes > 0
  }

  /**
   * 删除大纲的所有角色关联
   */
  deleteByOutlineId(outlineId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_outline_characters WHERE outline_id = ?')
    const result = stmt.run(outlineId)
    return result.changes
  }

  /**
   * 删除角色的所有大纲关联
   */
  deleteByCharacterId(characterId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_outline_characters WHERE character_id = ?')
    const result = stmt.run(characterId)
    return result.changes
  }

  /**
   * 迁移：从JSON字段迁移到关联表
   * 大纲表中存储的是角色ID数组，直接迁移即可
   */
  migrateFromJson(projectId: string): number {
    // 获取项目的所有大纲
    const stmt = this.db.prepare(`
      SELECT id, involved_characters FROM lw_story_outlines WHERE project_id = ?
    `)
    const outlines = stmt.all(projectId) as any[]

    let migratedCount = 0
    const now = Date.now()
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_outline_characters (id, outline_id, character_id, created_at)
      VALUES (?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      for (const outline of outlines) {
        const characterIds: string[] = this.parseJsonArray(outline.involved_characters)
        for (const characterId of characterIds) {
          const id = this.generateId()
          insertStmt.run(id, outline.id, characterId, now)
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
    return `oc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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