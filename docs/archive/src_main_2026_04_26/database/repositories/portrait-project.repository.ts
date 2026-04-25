/**
 * 人像项目数据访问层
 * @module database/repositories/portrait-project.repository
 * @description 提供人像项目的数据库操作（项目仅作为容器，包含多个人物角色）
 */

import Database from 'better-sqlite3'
import type {
  PortraitProject,
  CreatePortraitProjectRequest,
  UpdatePortraitProjectRequest
} from '../../../shared/types/portrait.types'
import { randomUUID } from 'crypto'

/**
 * 人像项目数据仓库
 */
export class PortraitProjectRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为 PortraitProject 对象
   */
  private rowToProject(row: any): PortraitProject {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      defaultProviderId: row.default_provider_id || undefined,
      defaultModelId: row.default_model_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  /**
   * 获取项目列表
   */
  async getList(page: number = 1, pageSize: number = 20): Promise<{ projects: PortraitProject[]; total: number }> {
    const offset = (page - 1) * pageSize

    // 获取总数
    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM portrait_projects').get() as { count: number }
    const total = countRow?.count || 0

    // 获取列表
    const rows = this.db.prepare(
      `SELECT * FROM portrait_projects ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(pageSize, offset) as any[]

    return {
      projects: rows.map(row => this.rowToProject(row)),
      total
    }
  }

  /**
   * 根据ID获取项目
   */
  async getById(id: string): Promise<PortraitProject | null> {
    const row = this.db.prepare('SELECT * FROM portrait_projects WHERE id = ?').get(id) as any
    if (!row) return null
    return this.rowToProject(row)
  }

  /**
   * 创建项目
   */
  async create(request: CreatePortraitProjectRequest): Promise<PortraitProject> {
    const id = randomUUID()
    const now = Date.now()

    this.db.prepare(
      `INSERT INTO portrait_projects (id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      id,
      request.name,
      request.description || null,
      now,
      now
    )

    return {
      id,
      name: request.name,
      description: request.description,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新项目
   */
  async update(request: UpdatePortraitProjectRequest): Promise<PortraitProject | null> {
    const project = await this.getById(request.id)
    if (!project) return null

    const fields: string[] = ['updated_at = ?']
    const values: any[] = [Date.now()]

    if (request.name !== undefined) {
      fields.push('name = ?')
      values.push(request.name)
    }
    if (request.description !== undefined) {
      fields.push('description = ?')
      values.push(request.description || null)
    }
    if (request.defaultProviderId !== undefined) {
      fields.push('default_provider_id = ?')
      values.push(request.defaultProviderId || null)
    }
    if (request.defaultModelId !== undefined) {
      fields.push('default_model_id = ?')
      values.push(request.defaultModelId || null)
    }

    values.push(request.id)
    this.db.prepare(`UPDATE portrait_projects SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    return this.getById(request.id)
  }

  /**
   * 删除项目
   */
  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM portrait_projects WHERE id = ?').run(id)
  }

  /**
   * 统计项目数量
   */
  async count(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM portrait_projects').get() as { count: number }
    return row?.count || 0
  }
}