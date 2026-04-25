/**
 * 技能角色关联仓库
 * @module database/repositories/lw-skill-character.repository
 * 符合第三范式，替代JSON存储
 */

import Database from 'better-sqlite3'

/**
 * 技能角色关联
 */
export interface SkillCharacterRelation {
  id: string
  skillId: string
  characterId: string
  createdAt: number
}

/**
 * 技能角色关联仓库
 */
export class LwSkillCharacterRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据技能ID获取所有关联的角色ID
   */
  getCharacterIdsBySkillId(skillId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT character_id FROM lw_skill_characters WHERE skill_id = ?
    `)
    const rows = stmt.all(skillId) as any[]
    return rows.map(row => row.character_id)
  }

  /**
   * 根据角色ID获取所有关联的技能ID
   */
  getSkillIdsByCharacterId(characterId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT skill_id FROM lw_skill_characters WHERE character_id = ?
    `)
    const rows = stmt.all(characterId) as any[]
    return rows.map(row => row.skill_id)
  }

  /**
   * 批量获取技能的角色ID映射
   * @param skillIds 技能ID列表
   * @returns Map<skillId, characterId[]>
   */
  getCharacterIdsBySkillIds(skillIds: string[]): Map<string, string[]> {
    const result = new Map<string, string[]>()

    if (skillIds.length === 0) return result

    const placeholders = skillIds.map(() => '?').join(',')
    const stmt = this.db.prepare(`
      SELECT skill_id, character_id FROM lw_skill_characters WHERE skill_id IN (${placeholders})
    `)
    const rows = stmt.all(...skillIds) as any[]

    for (const row of rows) {
      if (!result.has(row.skill_id)) {
        result.set(row.skill_id, [])
      }
      result.get(row.skill_id)!.push(row.character_id)
    }

    // 确保所有技能都有条目
    for (const skillId of skillIds) {
      if (!result.has(skillId)) {
        result.set(skillId, [])
      }
    }

    return result
  }

  /**
   * 添加技能角色关联
   */
  add(skillId: string, characterId: string): SkillCharacterRelation {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_skill_characters (id, skill_id, character_id, created_at)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(id, skillId, characterId, now)

    return { id, skillId, characterId, createdAt: now }
  }

  /**
   * 批量添加技能角色关联（事务）
   */
  batchAdd(skillId: string, characterIds: string[]): void {
    if (characterIds.length === 0) return

    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_skill_characters (id, skill_id, character_id, created_at)
      VALUES (?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      for (const characterId of characterIds) {
        const id = this.generateId()
        stmt.run(id, skillId, characterId, now)
      }
    })

    transaction()
  }

  /**
   * 替换技能的所有角色关联
   */
  replaceAll(skillId: string, characterIds: string[]): void {
    const transaction = this.db.transaction(() => {
      // 先删除现有关联
      this.deleteBySkillId(skillId)
      // 再添加新关联
      this.batchAdd(skillId, characterIds)
    })
    transaction()
  }

  /**
   * 删除技能角色关联
   */
  delete(skillId: string, characterId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM lw_skill_characters WHERE skill_id = ? AND character_id = ?
    `)
    const result = stmt.run(skillId, characterId)
    return result.changes > 0
  }

  /**
   * 删除技能的所有角色关联
   */
  deleteBySkillId(skillId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_skill_characters WHERE skill_id = ?')
    const result = stmt.run(skillId)
    return result.changes
  }

  /**
   * 删除角色的所有技能关联
   */
  deleteByCharacterId(characterId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_skill_characters WHERE character_id = ?')
    const result = stmt.run(characterId)
    return result.changes
  }

  /**
   * 迁移：从JSON字段迁移到关联表
   * 技能表中存储的是角色ID数组，直接迁移即可
   */
  migrateFromJson(projectId: string): number {
    // 获取项目的所有技能
    const stmt = this.db.prepare(`
      SELECT id, character_ids FROM lw_story_skills WHERE project_id = ?
    `)
    const skills = stmt.all(projectId) as any[]

    let migratedCount = 0
    const now = Date.now()
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_skill_characters (id, skill_id, character_id, created_at)
      VALUES (?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      for (const skill of skills) {
        const characterIds: string[] = this.parseJsonArray(skill.character_ids)
        for (const characterId of characterIds) {
          const id = this.generateId()
          insertStmt.run(id, skill.id, characterId, now)
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
    return `sc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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