/**
 * 故事概要仓库
 * @module database/repositories/lw-story-overview.repository
 */

import Database from 'better-sqlite3'
import {
  StoryOverview
} from '../../../shared/types/longwriting.types'

export class LwStoryOverviewRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取概要
   */
  getByProjectId(projectId: string): StoryOverview | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_overviews WHERE project_id = ?
    `)
    const row = stmt.get(projectId) as any
    return row ? this.mapToOverview(row) : null
  }

  /**
   * 根据 ID 获取概要
   */
  getById(id: string): StoryOverview | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_overviews WHERE id = ?
    `)
    const row = stmt.get(id) as any
    return row ? this.mapToOverview(row) : null
  }

  /**
   * 创建概要
   */
  create(projectId: string): StoryOverview {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO lw_story_overviews (id, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(id, projectId, now, now)

    return {
      id,
      projectId,
      storyType: 'other',
      title: '',
      coreIdea: '',
      style: undefined,
      targetReader: undefined,
      estimatedLength: undefined,
      otherRequirements: undefined,
      summary: '',
      coreConflict: '',
      estimatedChapters: 0,
      isLocked: false,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新概要
   */
  update(id: string, data: Partial<StoryOverview>): StoryOverview | null {
    const overview = this.getById(id)
    if (!overview) return null

    const updates: string[] = []
    const values: any[] = []

    const fields = [
      'story_type', 'title', 'core_idea', 'style', 'target_reader',
      'estimated_length', 'other_requirements', 'summary', 'core_conflict',
      'estimated_chapters', 'is_locked'
    ]

    const dataMap: Record<string, any> = {
      story_type: data.storyType,
      title: data.title,
      core_idea: data.coreIdea,
      style: data.style,
      target_reader: data.targetReader,
      estimated_length: data.estimatedLength,
      other_requirements: data.otherRequirements,
      summary: data.summary,
      core_conflict: data.coreConflict,
      estimated_chapters: data.estimatedChapters,
      is_locked: data.isLocked ? 1 : 0
    }

    for (const field of fields) {
      if (dataMap[field] !== undefined) {
        updates.push(`${field} = ?`)
        values.push(dataMap[field])
      }
    }

    if (updates.length === 0) return overview

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_story_overviews SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除概要
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_story_overviews WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 锁定/解锁概要
   */
  setLocked(id: string, locked: boolean): boolean {
    const stmt = this.db.prepare(`
      UPDATE lw_story_overviews SET is_locked = ?, updated_at = ? WHERE id = ?
    `)
    const result = stmt.run(locked ? 1 : 0, Date.now(), id)
    return result.changes > 0
  }

  private generateId(): string {
    return `overview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private mapToOverview(row: any): StoryOverview {
    return {
      id: row.id,
      projectId: row.project_id,
      storyType: row.story_type || 'other',
      title: row.title || '',
      coreIdea: row.core_idea || '',
      style: row.style || undefined,
      targetReader: row.target_reader || undefined,
      estimatedLength: row.estimated_length || undefined,
      otherRequirements: row.other_requirements || undefined,
      summary: row.summary || '',
      coreConflict: row.core_conflict || '',
      estimatedChapters: row.estimated_chapters || 0,
      isLocked: !!row.is_locked,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}