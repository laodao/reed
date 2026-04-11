/**
 * 地点仓库
 * @module database/repositories/lw-location.repository
 */

import Database from 'better-sqlite3'
import {
  StoryLocation,
  LocationType,
  LocationImportance,
  EntityImportance,
  TemporaryLocationTemplateType,
  EntitySourceType
} from '../../../shared/types/longwriting.types'

/**
 * 地点仓库
 */
export class LwLocationRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有地点
   */
  getByProjectId(projectId: string): StoryLocation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_locations WHERE project_id = ? ORDER BY created_at DESC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(this.mapToLocation)
  }

  /**
   * 根据项目 ID 获取所有临时地点
   */
  getTemporaryByProjectId(projectId: string): StoryLocation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_locations WHERE project_id = ? AND entity_importance = 'temporary' ORDER BY created_at DESC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(this.mapToLocation)
  }

  /**
   * 根据 ID 获取地点
   */
  getById(id: string): StoryLocation | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_story_locations WHERE id = ?`)
    const row = stmt.get(id) as any
    return row ? this.mapToLocation(row) : null
  }

  /**
   * 根据来源剧集ID获取地点
   */
  getBySourceEpisodeId(episodeId: string): StoryLocation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_locations WHERE source_episode_id = ? ORDER BY created_at DESC
    `)
    const rows = stmt.all(episodeId) as any[]
    return rows.map(this.mapToLocation)
  }

  /**
   * 创建地点
   */
  create(data: {
    projectId: string
    name: string
    type: LocationType
    importance: LocationImportance
    entityImportance?: EntityImportance
    templateType?: TemporaryLocationTemplateType
    generatedImageId?: string
    description: string
    mapId?: string
    sourceType?: EntitySourceType
    sourceEpisodeId?: string
  }): StoryLocation {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO lw_story_locations (id, project_id, name, type, description, importance, entity_importance, template_type, generated_image_id, map_id, source_type, source_episode_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id, data.projectId, data.name, data.type, data.description,
      data.importance, data.entityImportance || 'secondary',
      data.templateType || null, data.generatedImageId || null,
      data.mapId || null, data.sourceType || 'longwriting', data.sourceEpisodeId || null,
      now, now
    )

    return {
      id,
      projectId: data.projectId,
      name: data.name,
      type: data.type,
      description: data.description,
      importance: data.importance,
      entityImportance: data.entityImportance || 'secondary' as EntityImportance,
      templateType: data.templateType,
      generatedImageId: data.generatedImageId,
      mapId: data.mapId,
      sourceType: data.sourceType || 'longwriting' as EntitySourceType,
      sourceEpisodeId: data.sourceEpisodeId,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新地点
   */
  update(id: string, data: Partial<StoryLocation>): StoryLocation | null {
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
    if (data.description !== undefined) {
      updates.push('description = ?')
      values.push(data.description)
    }
    if (data.importance !== undefined) {
      updates.push('importance = ?')
      values.push(data.importance)
    }
    if (data.entityImportance !== undefined) {
      updates.push('entity_importance = ?')
      values.push(data.entityImportance)
    }
    if (data.templateType !== undefined) {
      updates.push('template_type = ?')
      values.push(data.templateType)
    }
    if (data.generatedImageId !== undefined) {
      updates.push('generated_image_id = ?')
      values.push(data.generatedImageId)
    }
    if (data.mapId !== undefined) {
      updates.push('map_id = ?')
      values.push(data.mapId || null)
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
      UPDATE lw_story_locations SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除地点
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_story_locations WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `loc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到对象
   */
  private mapToLocation(row: any): StoryLocation {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      type: row.type as LocationType,
      description: row.description,
      importance: row.importance as LocationImportance,
      entityImportance: row.entity_importance || 'secondary' as EntityImportance,
      templateType: row.template_type as TemporaryLocationTemplateType | undefined,
      generatedImageId: row.generated_image_id,
      mapId: row.map_id || undefined,
      sourceType: row.source_type || 'longwriting' as EntitySourceType,
      sourceEpisodeId: row.source_episode_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}