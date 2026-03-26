/**
 * 人像项目数据访问层
 * @module database/repositories/portrait-project.repository
 * @description 提供人像项目的数据库操作
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
      prompt: row.prompt,
      referenceImages: row.reference_images ? JSON.parse(row.reference_images) : [],
      providerId: row.provider_id,
      modelId: row.model_id,
      config: row.config ? JSON.parse(row.config) : { angles: ['front', 'left', 'right', 'back'], backgroundType: 'solid' },
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
    const defaultConfig = {
      angles: ['front', 'left', 'right', 'back'] as const,
      backgroundType: 'solid' as const,
      ...request.config
    }

    this.db.prepare(
      `INSERT INTO portrait_projects (id, name, description, prompt, reference_images, provider_id, model_id, config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      request.name,
      request.description || null,
      request.prompt,
      JSON.stringify(request.referenceImages || []),
      request.providerId,
      request.modelId,
      JSON.stringify(defaultConfig),
      now,
      now
    )

    return {
      id,
      name: request.name,
      description: request.description,
      prompt: request.prompt,
      referenceImages: request.referenceImages || [],
      providerId: request.providerId,
      modelId: request.modelId,
      config: defaultConfig,
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
    if (request.prompt !== undefined) {
      fields.push('prompt = ?')
      values.push(request.prompt)
    }
    if (request.referenceImages !== undefined) {
      fields.push('reference_images = ?')
      values.push(JSON.stringify(request.referenceImages))
    }
    if (request.providerId !== undefined) {
      fields.push('provider_id = ?')
      values.push(request.providerId)
    }
    if (request.modelId !== undefined) {
      fields.push('model_id = ?')
      values.push(request.modelId)
    }
    if (request.config !== undefined) {
      fields.push('config = ?')
      values.push(JSON.stringify({ ...project.config, ...request.config }))
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