/**
 * 长文写作项目仓库
 * @module database/repositories/lw-project.repository
 */

import Database from 'better-sqlite3'
import {
  LongWritingProject,
  CreateProjectRequest,
  UpdateProjectRequest
} from '@shared/types/longwriting.types'

/**
 * 长文写作项目仓库
 */
export class LwProjectRepository {
  constructor(private db: Database.Database) {}

  /**
   * 获取所有项目
   */
  getAll(): LongWritingProject[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_projects ORDER BY created_at DESC
    `)
    const rows = stmt.all() as any[]
    return rows.map(this.mapToProject)
  }

  /**
   * 根据 ID 获取项目
   */
  getById(id: string): LongWritingProject | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_projects WHERE id = ?
    `)
    const row = stmt.get(id) as any
    return row ? this.mapToProject(row) : null
  }

  /**
   * 根据类型获取项目
   */
  getByType(type: 'story' | 'comment'): LongWritingProject[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_projects WHERE type = ? ORDER BY created_at DESC
    `)
    const rows = stmt.all(type) as any[]
    return rows.map(this.mapToProject)
  }

  /**
   * 创建项目
   */
  create(data: CreateProjectRequest): LongWritingProject {
    const id = this.generateId()
    const now = Date.now()
    const initialStage = data.type === 'story' ? 'overview' : 'topic'

    const stmt = this.db.prepare(`
      INSERT INTO lw_projects (id, name, type, stage, progress, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `)

    stmt.run(id, data.name, data.type, initialStage, now, now)

    return {
      id,
      name: data.name,
      type: data.type,
      stage: initialStage,
      progress: 0,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新项目
   */
  update(id: string, data: UpdateProjectRequest): LongWritingProject | null {
    const project = this.getById(id)
    if (!project) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }
    if (data.stage !== undefined) {
      updates.push('stage = ?')
      values.push(data.stage)
    }
    if (data.progress !== undefined) {
      updates.push('progress = ?')
      values.push(data.progress)
    }

    if (updates.length === 0) return project

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_projects SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除项目
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_projects WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 检查项目是否存在
   */
  exists(id: string): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM lw_projects WHERE id = ?')
    return !!stmt.get(id)
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `lw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到项目对象
   */
  private mapToProject(row: any): LongWritingProject {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      stage: row.stage,
      progress: row.progress,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}