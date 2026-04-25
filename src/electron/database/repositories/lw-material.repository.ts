/**
 * 故事素材仓库
 * @module database/repositories/lw-material.repository
 */

import { DatabaseManager } from '../index'
import type { StoryMaterial, MaterialType, MaterialStatus } from '@shared/types/longwriting.types'

type MaterialRow = {
  id: string
  project_id: string
  name: string
  type: string
  source: string | null
  content: string | null
  status: string
  error_message: string | null
  retry_count: number
  used: number
  created_at: number
}

/**
 * 素材仓库
 */
export class LwMaterialRepository {
  private db: DatabaseManager

  constructor(db: DatabaseManager) {
    this.db = db
  }

  /**
   * 获取项目的所有素材
   */
  getByProjectId(projectId: string): StoryMaterial[] {
    const stmt = this.db.db!.prepare(`
      SELECT * FROM lw_story_materials WHERE project_id = ? ORDER BY created_at DESC
    `)
    const rows = stmt.all(projectId) as MaterialRow[]
    return rows.map(this.mapToMaterial)
  }

  /**
   * 根据 ID 获取素材
   */
  getById(id: string): StoryMaterial | null {
    const stmt = this.db.db!.prepare(`
      SELECT * FROM lw_story_materials WHERE id = ?
    `)
    const row = stmt.get(id) as MaterialRow | undefined
    return row ? this.mapToMaterial(row) : null
  }

  /**
   * 创建素材
   */
  create(data: {
    projectId: string
    name: string
    type: MaterialType
    source?: string
    content?: string
    status?: MaterialStatus
  }): StoryMaterial {
    const id = `material_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = Date.now()

    const stmt = this.db.db!.prepare(`
      INSERT INTO lw_story_materials (id, project_id, name, type, source, content, status, retry_count, used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `)
    stmt.run(
      id,
      data.projectId,
      data.name,
      data.type,
      data.source || null,
      data.content || null,
      data.status || 'pending',
      now
    )

    return {
      id,
      projectId: data.projectId,
      name: data.name,
      type: data.type,
      source: data.source || '',
      content: data.content || '',
      status: data.status || 'pending',
      errorMessage: '',
      retryCount: 0,
      used: false,
      createdAt: now
    }
  }

  /**
   * 更新素材
   */
  update(id: string, data: Partial<{
    name: string
    type: MaterialType
    source: string
    content: string
    status: MaterialStatus
    errorMessage: string
    retryCount: number
    used: boolean
  }>): StoryMaterial | null {
    const fields: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
      fields.push('name = ?')
      values.push(data.name)
    }
    if (data.type !== undefined) {
      fields.push('type = ?')
      values.push(data.type)
    }
    if (data.source !== undefined) {
      fields.push('source = ?')
      values.push(data.source)
    }
    if (data.content !== undefined) {
      fields.push('content = ?')
      values.push(data.content)
    }
    if (data.status !== undefined) {
      fields.push('status = ?')
      values.push(data.status)
    }
    if (data.errorMessage !== undefined) {
      fields.push('error_message = ?')
      values.push(data.errorMessage)
    }
    if (data.retryCount !== undefined) {
      fields.push('retry_count = ?')
      values.push(data.retryCount)
    }
    if (data.used !== undefined) {
      fields.push('used = ?')
      values.push(data.used ? 1 : 0)
    }

    if (fields.length === 0) {
      return this.getById(id)
    }

    values.push(id)
    const stmt = this.db.db!.prepare(`
      UPDATE lw_story_materials SET ${fields.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 更新素材状态
   */
  updateStatus(id: string, status: MaterialStatus, errorMessage?: string): boolean {
    const stmt = this.db.db!.prepare(`
      UPDATE lw_story_materials SET status = ?, error_message = ? WHERE id = ?
    `)
    const result = stmt.run(status, errorMessage || null, id)
    return result.changes > 0
  }

  /**
   * 增加重试计数
   */
  incrementRetryCount(id: string): number {
    const stmt = this.db.db!.prepare(`
      UPDATE lw_story_materials SET retry_count = retry_count + 1 WHERE id = ?
    `)
    stmt.run(id)

    const material = this.getById(id)
    return material?.retryCount || 0
  }

  /**
   * 标记素材为已使用
   */
  markAsUsed(id: string): boolean {
    const stmt = this.db.db!.prepare(`
      UPDATE lw_story_materials SET used = 1 WHERE id = ?
    `)
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 删除素材
   */
  delete(id: string): boolean {
    const stmt = this.db.db!.prepare('DELETE FROM lw_story_materials WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 删除项目的所有素材
   */
  deleteByProjectId(projectId: string): number {
    const stmt = this.db.db!.prepare('DELETE FROM lw_story_materials WHERE project_id = ?')
    const result = stmt.run(projectId)
    return result.changes
  }

  /**
   * 映射数据库行到素材对象
   */
  private mapToMaterial(row: MaterialRow): StoryMaterial {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      type: row.type as MaterialType,
      source: row.source || '',
      content: row.content || '',
      status: row.status as MaterialStatus,
      errorMessage: row.error_message || '',
      retryCount: row.retry_count,
      used: row.used === 1,
      createdAt: row.created_at
    }
  }
}