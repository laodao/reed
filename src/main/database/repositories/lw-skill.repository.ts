/**
 * 技能仓库
 * @module database/repositories/lw-skill.repository
 */

import Database from 'better-sqlite3'
import { StorySkill, SkillType, SkillLevel } from '../../../shared/types/longwriting.types'

/**
 * 技能仓库
 */
export class LwSkillRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有技能
   */
  getByProjectId(projectId: string): StorySkill[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_skills WHERE project_id = ? ORDER BY created_at DESC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(this.mapToSkill)
  }

  /**
   * 根据 ID 获取技能
   */
  getById(id: string): StorySkill | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_story_skills WHERE id = ?`)
    const row = stmt.get(id) as any
    return row ? this.mapToSkill(row) : null
  }

  /**
   * 创建技能
   */
  create(data: {
    projectId: string
    name: string
    type: SkillType
    level: SkillLevel
    description: string
    system: string
    characterIds: string[]
  }): StorySkill {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO lw_story_skills (id, project_id, name, type, level, description, system, character_ids, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(id, data.projectId, data.name, data.type, data.level, data.description, data.system, JSON.stringify(data.characterIds), now, now)

    return {
      id,
      projectId: data.projectId,
      name: data.name,
      type: data.type,
      level: data.level,
      description: data.description,
      system: data.system,
      characterIds: data.characterIds,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新技能
   */
  update(id: string, data: Partial<StorySkill>): StorySkill | null {
    const existing = this.getById(id)
    if (!existing) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }
    if (data.type !== undefined) {
      updates.push('type = ?')
      values.push(data.type)
    }
    if (data.level !== undefined) {
      updates.push('level = ?')
      values.push(data.level)
    }
    if (data.description !== undefined) {
      updates.push('description = ?')
      values.push(data.description)
    }
    if (data.system !== undefined) {
      updates.push('system = ?')
      values.push(data.system)
    }
    if (data.characterIds !== undefined) {
      updates.push('character_ids = ?')
      values.push(JSON.stringify(data.characterIds))
    }

    if (updates.length === 0) return existing

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_story_skills SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除技能
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_story_skills WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `skill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到对象
   */
  private mapToSkill(row: any): StorySkill {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      type: row.type as SkillType,
      level: row.level as SkillLevel,
      description: row.description,
      system: row.system,
      characterIds: JSON.parse(row.character_ids || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}