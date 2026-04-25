/**
 * 物品仓库
 * @module database/repositories/lw-item.repository
 */

import Database from 'better-sqlite3'
import { StoryItem, ItemType, ItemLevel, EntityImportance, EntitySourceType } from '@shared/types/longwriting.types'

/**
 * 物品仓库
 */
export class LwItemRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有物品
   */
  getByProjectId(projectId: string): StoryItem[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_items WHERE project_id = ? ORDER BY created_at DESC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(this.mapToItem)
  }

  /**
   * 根据 ID 获取物品
   */
  getById(id: string): StoryItem | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_story_items WHERE id = ?`)
    const row = stmt.get(id) as any
    return row ? this.mapToItem(row) : null
  }

  /**
   * 根据来源剧集ID获取物品
   */
  getBySourceEpisodeId(episodeId: string): StoryItem[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_items WHERE source_episode_id = ? ORDER BY created_at DESC
    `)
    const rows = stmt.all(episodeId) as any[]
    return rows.map(this.mapToItem)
  }

  /**
   * 创建物品
   */
  create(data: {
    projectId: string
    name: string
    type: ItemType
    level: ItemLevel
    importance?: EntityImportance
    description: string
    ownerId?: string
    sourceType?: EntitySourceType
    sourceEpisodeId?: string
  }): StoryItem {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO lw_story_items (id, project_id, name, type, level, importance, description, owner_id, source_type, source_episode_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id, data.projectId, data.name, data.type, data.level,
      data.importance || 'secondary', data.description, data.ownerId || null,
      data.sourceType || 'longwriting', data.sourceEpisodeId || null,
      now, now
    )

    return {
      id,
      projectId: data.projectId,
      name: data.name,
      type: data.type,
      level: data.level,
      importance: data.importance || 'secondary' as EntityImportance,
      description: data.description,
      ownerId: data.ownerId,
      sourceType: data.sourceType || 'longwriting' as EntitySourceType,
      sourceEpisodeId: data.sourceEpisodeId,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新物品
   */
  update(id: string, data: Partial<StoryItem>): StoryItem | null {
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
    if (data.importance !== undefined) {
      updates.push('importance = ?')
      values.push(data.importance)
    }
    if (data.description !== undefined) {
      updates.push('description = ?')
      values.push(data.description)
    }
    if (data.ownerId !== undefined) {
      updates.push('owner_id = ?')
      values.push(data.ownerId || null)
    }
    if (data.sourceType !== undefined) {
      updates.push('source_type = ?')
      values.push(data.sourceType)
    }
    if (data.sourceEpisodeId !== undefined) {
      updates.push('source_episode_id = ?')
      values.push(data.sourceEpisodeId || null)
    }

    if (updates.length === 0) return existing

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_story_items SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除物品
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_story_items WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到对象
   */
  private mapToItem(row: any): StoryItem {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      type: row.type as ItemType,
      level: row.level as ItemLevel,
      importance: row.importance || 'secondary' as EntityImportance,
      description: row.description,
      ownerId: row.owner_id || undefined,
      sourceType: row.source_type || 'longwriting' as EntitySourceType,
      sourceEpisodeId: row.source_episode_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}