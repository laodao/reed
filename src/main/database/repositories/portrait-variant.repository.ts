/**
 * 人像变体数据访问层
 * @module database/repositories/portrait-variant.repository
 * @description 提供人像变体的数据库操作
 */

import Database from 'better-sqlite3'
import type {
  PortraitVariant,
  PortraitVariantType,
  PortraitAngle,
  PortraitVariantInfo
} from '../../../shared/types/portrait.types'
import { randomUUID } from 'crypto'

/**
 * 人像变体数据仓库
 */
export class PortraitVariantRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为 PortraitVariant 对象
   */
  private rowToVariant(row: any): PortraitVariant {
    return {
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      parentId: row.parent_id || undefined,
      angle: row.angle,
      imagePath: row.image_path,
      prompt: row.prompt,
      config: row.config ? JSON.parse(row.config) : {},
      variantInfo: row.variant_info ? JSON.parse(row.variant_info) : undefined,
      createdAt: row.created_at
    }
  }

  /**
   * 获取项目的所有变体
   */
  async getByProjectId(projectId: string): Promise<PortraitVariant[]> {
    const rows = this.db.prepare(
      `SELECT * FROM portrait_variants WHERE project_id = ? ORDER BY created_at DESC`
    ).all(projectId) as any[]

    return rows.map(row => this.rowToVariant(row))
  }

  /**
   * 根据ID获取变体
   */
  async getById(id: string): Promise<PortraitVariant | null> {
    const row = this.db.prepare('SELECT * FROM portrait_variants WHERE id = ?').get(id) as any
    if (!row) return null
    return this.rowToVariant(row)
  }

  /**
   * 获取项目指定类型和角度的变体
   */
  async getByProjectAndAngle(projectId: string, type: PortraitVariantType, angle: PortraitAngle): Promise<PortraitVariant | null> {
    const row = this.db.prepare(
      'SELECT * FROM portrait_variants WHERE project_id = ? AND type = ? AND angle = ?'
    ).get(projectId, type, angle) as any

    if (!row) return null
    return this.rowToVariant(row)
  }

  /**
   * 创建变体
   */
  async create(data: {
    projectId: string
    type: PortraitVariantType
    parentId?: string
    angle: PortraitAngle
    imagePath: string
    prompt: string
    config?: Record<string, any>
    variantInfo?: PortraitVariantInfo
  }): Promise<PortraitVariant> {
    const id = randomUUID()
    const now = Date.now()

    this.db.prepare(
      `INSERT INTO portrait_variants (id, project_id, type, parent_id, angle, image_path, prompt, config, variant_info, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      data.projectId,
      data.type,
      data.parentId || null,
      data.angle,
      data.imagePath,
      data.prompt,
      JSON.stringify(data.config || {}),
      data.variantInfo ? JSON.stringify(data.variantInfo) : null,
      now
    )

    return {
      id,
      projectId: data.projectId,
      type: data.type,
      parentId: data.parentId,
      angle: data.angle,
      imagePath: data.imagePath,
      prompt: data.prompt,
      config: data.config || {},
      variantInfo: data.variantInfo,
      createdAt: now
    }
  }

  /**
   * 批量创建变体
   */
  async createBatch(variants: Array<{
    projectId: string
    type: PortraitVariantType
    parentId?: string
    angle: PortraitAngle
    imagePath: string
    prompt: string
    config?: Record<string, any>
    variantInfo?: PortraitVariantInfo
  }>): Promise<PortraitVariant[]> {
    const results: PortraitVariant[] = []
    const now = Date.now()

    const stmt = this.db.prepare(
      `INSERT INTO portrait_variants (id, project_id, type, parent_id, angle, image_path, prompt, config, variant_info, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    const insertMany = this.db.transaction((items: typeof variants) => {
      for (const data of items) {
        const id = randomUUID()
        stmt.run(
          id,
          data.projectId,
          data.type,
          data.parentId || null,
          data.angle,
          data.imagePath,
          data.prompt,
          JSON.stringify(data.config || {}),
          data.variantInfo ? JSON.stringify(data.variantInfo) : null,
          now
        )
        results.push({
          id,
          projectId: data.projectId,
          type: data.type,
          parentId: data.parentId,
          angle: data.angle,
          imagePath: data.imagePath,
          prompt: data.prompt,
          config: data.config || {},
          variantInfo: data.variantInfo,
          createdAt: now
        })
      }
    })

    insertMany(variants)
    return results
  }

  /**
   * 更新变体
   */
  async update(id: string, data: Partial<Omit<PortraitVariant, 'id' | 'projectId' | 'createdAt'>>): Promise<PortraitVariant | null> {
    const variant = await this.getById(id)
    if (!variant) return null

    const fields: string[] = []
    const values: any[] = []

    if (data.imagePath !== undefined) {
      fields.push('image_path = ?')
      values.push(data.imagePath)
    }
    if (data.prompt !== undefined) {
      fields.push('prompt = ?')
      values.push(data.prompt)
    }
    if (data.config !== undefined) {
      fields.push('config = ?')
      values.push(JSON.stringify(data.config))
    }
    if (data.variantInfo !== undefined) {
      fields.push('variant_info = ?')
      values.push(JSON.stringify(data.variantInfo))
    }

    if (fields.length > 0) {
      values.push(id)
      this.db.prepare(`UPDATE portrait_variants SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    return this.getById(id)
  }

  /**
   * 删除变体
   */
  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM portrait_variants WHERE id = ?').run(id)
  }

  /**
   * 删除项目的所有变体
   */
  async deleteByProjectId(projectId: string): Promise<void> {
    this.db.prepare('DELETE FROM portrait_variants WHERE project_id = ?').run(projectId)
  }

  /**
   * 统计项目的变体数量
   */
  async countByProjectId(projectId: string): Promise<number> {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM portrait_variants WHERE project_id = ?'
    ).get(projectId) as { count: number }
    return row?.count || 0
  }

  /**
   * 获取项目的基础变体
   */
  async getBaseVariants(projectId: string): Promise<PortraitVariant[]> {
    const rows = this.db.prepare(
      `SELECT * FROM portrait_variants WHERE project_id = ? AND type = 'base' ORDER BY angle`
    ).all(projectId) as any[]

    return rows.map(row => this.rowToVariant(row))
  }

  /**
   * 获取项目的正面基础变体
   */
  async getFrontVariant(projectId: string): Promise<PortraitVariant | null> {
    const row = this.db.prepare(
      `SELECT * FROM portrait_variants WHERE project_id = ? AND type = 'base' AND angle = 'front'`
    ).get(projectId) as any

    if (!row) return null
    return this.rowToVariant(row)
  }

  /**
   * 获取项目的换衣变体
   */
  async getClothesVariants(projectId: string): Promise<PortraitVariant[]> {
    const rows = this.db.prepare(
      `SELECT * FROM portrait_variants WHERE project_id = ? AND type = 'clothes' ORDER BY created_at DESC`
    ).all(projectId) as any[]

    return rows.map(row => this.rowToVariant(row))
  }

  /**
   * 获取项目的换背景变体
   */
  async getBackgroundVariants(projectId: string): Promise<PortraitVariant[]> {
    const rows = this.db.prepare(
      `SELECT * FROM portrait_variants WHERE project_id = ? AND type = 'background' ORDER BY created_at DESC`
    ).all(projectId) as any[]

    return rows.map(row => this.rowToVariant(row))
  }
}