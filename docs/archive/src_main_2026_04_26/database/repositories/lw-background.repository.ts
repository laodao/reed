/**
 * 时代背景仓库
 * @module database/repositories/lw-background.repository
 */

import Database from 'better-sqlite3'
import { StoryBackground, EraType } from '../../../shared/types/longwriting.types'

/**
 * 时代背景仓库
 */
export class LwBackgroundRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取背景设定
   */
  getByProjectId(projectId: string): StoryBackground | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_backgrounds WHERE project_id = ?
    `)
    const row = stmt.get(projectId) as any
    return row ? this.mapToBackground(row) : null
  }

  /**
   * 创建背景设定
   */
  create(projectId: string): StoryBackground {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO lw_story_backgrounds (id, project_id, era_type, era_description, social_structure, tech_level, special_rules, faction_distribution, geographic_orientation, created_at, updated_at)
      VALUES (?, ?, 'ancient', '', '', '', '', '', '', ?, ?)
    `)

    stmt.run(id, projectId, now, now)

    return {
      id,
      projectId,
      eraType: 'ancient',
      eraDescription: '',
      socialStructure: '',
      techLevel: '',
      specialRules: '',
      factionDistribution: '',
      geographicOrientation: '',
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新背景设定
   */
  update(id: string, data: Partial<StoryBackground>): StoryBackground | null {
    const existing = this.getById(id)
    if (!existing) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.eraType !== undefined) {
      updates.push('era_type = ?')
      values.push(data.eraType)
    }
    if (data.eraDescription !== undefined) {
      updates.push('era_description = ?')
      values.push(data.eraDescription)
    }
    if (data.socialStructure !== undefined) {
      updates.push('social_structure = ?')
      values.push(data.socialStructure)
    }
    if (data.techLevel !== undefined) {
      updates.push('tech_level = ?')
      values.push(data.techLevel)
    }
    if (data.specialRules !== undefined) {
      updates.push('special_rules = ?')
      values.push(data.specialRules)
    }
    if (data.factionDistribution !== undefined) {
      updates.push('faction_distribution = ?')
      values.push(data.factionDistribution)
    }
    if (data.geographicOrientation !== undefined) {
      updates.push('geographic_orientation = ?')
      values.push(data.geographicOrientation)
    }

    if (updates.length === 0) return existing

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_story_backgrounds SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 根据 ID 获取
   */
  getById(id: string): StoryBackground | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_story_backgrounds WHERE id = ?`)
    const row = stmt.get(id) as any
    return row ? this.mapToBackground(row) : null
  }

  /**
   * 删除
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_story_backgrounds WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `bg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到对象
   */
  private mapToBackground(row: any): StoryBackground {
    return {
      id: row.id,
      projectId: row.project_id,
      eraType: row.era_type as EraType,
      eraDescription: row.era_description,
      socialStructure: row.social_structure,
      techLevel: row.tech_level,
      specialRules: row.special_rules,
      factionDistribution: row.faction_distribution || '',
      geographicOrientation: row.geographic_orientation || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}