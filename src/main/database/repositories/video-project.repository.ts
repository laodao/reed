/**
 * 剧集项目仓库
 * @module database/repositories/video-project.repository
 */

import Database from 'better-sqlite3'
import {
  VideoProject,
  VideoProjectConfig,
  VideoProjectRecord
} from '../../../shared/types/story-to-video.types'

/**
 * 创建剧集项目请求
 */
export interface CreateVideoProjectRequest {
  name: string
  longWritingProjectId: string
  config: VideoProjectConfig
}

/**
 * 更新剧集项目请求
 */
export interface UpdateVideoProjectRequest {
  name?: string
  status?: VideoProject['status']
  config?: VideoProjectConfig
}

/**
 * 剧集项目仓库
 */
export class VideoProjectRepository {
  constructor(private db: Database.Database) {}

  /**
   * 获取所有项目
   */
  getAll(): VideoProject[] {
    const stmt = this.db.prepare(`
      SELECT * FROM video_projects ORDER BY created_at DESC
    `)
    const rows = stmt.all() as VideoProjectRecord[]
    return rows.map(this.mapToProject)
  }

  /**
   * 根据长文项目 ID 获取剧集项目列表
   */
  getByLongWritingProjectId(longWritingProjectId: string): VideoProject[] {
    const stmt = this.db.prepare(`
      SELECT * FROM video_projects WHERE long_writing_project_id = ? ORDER BY created_at DESC
    `)
    const rows = stmt.all(longWritingProjectId) as VideoProjectRecord[]
    return rows.map(this.mapToProject)
  }

  /**
   * 根据 ID 获取项目
   */
  getById(id: string): VideoProject | null {
    const stmt = this.db.prepare(`
      SELECT * FROM video_projects WHERE id = ?
    `)
    const row = stmt.get(id) as VideoProjectRecord | undefined
    return row ? this.mapToProject(row) : null
  }

  /**
   * 创建项目
   */
  create(data: CreateVideoProjectRequest): VideoProject {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO video_projects (id, name, long_writing_project_id, status, config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.name,
      data.longWritingProjectId,
      'draft',
      JSON.stringify(data.config),
      now,
      now
    )

    return {
      id,
      name: data.name,
      longWritingProjectId: data.longWritingProjectId,
      status: 'draft',
      config: data.config,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新项目
   */
  update(id: string, data: UpdateVideoProjectRequest): VideoProject | null {
    const project = this.getById(id)
    if (!project) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }
    if (data.status !== undefined) {
      updates.push('status = ?')
      values.push(data.status)
    }
    if (data.config !== undefined) {
      updates.push('config = ?')
      values.push(JSON.stringify(data.config))
    }

    if (updates.length === 0) return project

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE video_projects SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除项目
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM video_projects WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 检查项目是否存在
   */
  exists(id: string): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM video_projects WHERE id = ?')
    return !!stmt.get(id)
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `vp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到项目对象
   */
  private mapToProject(row: VideoProjectRecord): VideoProject {
    return {
      id: row.id,
      name: row.name,
      longWritingProjectId: row.long_writing_project_id,
      status: row.status as VideoProject['status'],
      config: JSON.parse(row.config) as VideoProjectConfig,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}