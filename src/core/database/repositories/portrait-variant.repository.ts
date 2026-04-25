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
} from '@shared/types/portrait.types'
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
      characterId: row.character_id,
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
   * 获取角色的所有变体
   */
  async getByCharacterId(characterId: string): Promise<PortraitVariant[]> {
    const rows = this.db.prepare(
      `SELECT * FROM portrait_variants WHERE character_id = ? ORDER BY created_at DESC`
    ).all(characterId) as any[]

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
   * 获取角色指定类型和角度的变体
   */
  async getByCharacterAndAngle(characterId: string, type: PortraitVariantType, angle: PortraitAngle): Promise<PortraitVariant | null> {
    const row = this.db.prepare(
      'SELECT * FROM portrait_variants WHERE character_id = ? AND type = ? AND angle = ?'
    ).get(characterId, type, angle) as any

    if (!row) return null
    return this.rowToVariant(row)
  }

  /**
   * 创建变体
   */
  async create(data: {
    characterId: string
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
      `INSERT INTO portrait_variants (id, character_id, type, parent_id, angle, image_path, prompt, config, variant_info, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      data.characterId,
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
      characterId: data.characterId,
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
    characterId: string
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
      `INSERT INTO portrait_variants (id, character_id, type, parent_id, angle, image_path, prompt, config, variant_info, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    const insertMany = this.db.transaction((items: typeof variants) => {
      for (const data of items) {
        const id = randomUUID()
        stmt.run(
          id,
          data.characterId,
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
          characterId: data.characterId,
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
  async update(id: string, data: Partial<Omit<PortraitVariant, 'id' | 'characterId' | 'createdAt'>>): Promise<PortraitVariant | null> {
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
   * 删除角色的所有变体
   */
  async deleteByCharacterId(characterId: string): Promise<void> {
    this.db.prepare('DELETE FROM portrait_variants WHERE character_id = ?').run(characterId)
  }

  /**
   * 统计角色的变体数量
   */
  async countByCharacterId(characterId: string): Promise<number> {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM portrait_variants WHERE character_id = ?'
    ).get(characterId) as { count: number }
    return row?.count || 0
  }

  /**
   * 获取角色的基础变体
   */
  async getBaseVariants(characterId: string): Promise<PortraitVariant[]> {
    const rows = this.db.prepare(
      `SELECT * FROM portrait_variants WHERE character_id = ? AND type = 'base' ORDER BY angle`
    ).all(characterId) as any[]

    return rows.map(row => this.rowToVariant(row))
  }

  /**
   * 获取角色的正面基础变体
   */
  async getFrontVariant(characterId: string): Promise<PortraitVariant | null> {
    const row = this.db.prepare(
      `SELECT * FROM portrait_variants WHERE character_id = ? AND type = 'base' AND angle = 'front'`
    ).get(characterId) as any

    if (!row) return null
    return this.rowToVariant(row)
  }

  /**
   * 获取角色的换衣变体（正面）
   */
  async getClothesVariants(characterId: string): Promise<PortraitVariant[]> {
    const rows = this.db.prepare(
      `SELECT * FROM portrait_variants WHERE character_id = ? AND type = 'clothes' AND angle = 'front' ORDER BY created_at DESC`
    ).all(characterId) as any[]

    return rows.map(row => this.rowToVariant(row))
  }

  /**
   * 获取角色的换背景变体（正面）
   */
  async getBackgroundVariants(characterId: string): Promise<PortraitVariant[]> {
    const rows = this.db.prepare(
      `SELECT * FROM portrait_variants WHERE character_id = ? AND type = 'background' AND angle = 'front' ORDER BY created_at DESC`
    ).all(characterId) as any[]

    return rows.map(row => this.rowToVariant(row))
  }

  // ==================== 兼容旧API（迁移期间保留）====================

  /**
   * @deprecated 使用 getByCharacterId 替代
   */
  async getByProjectId(projectId: string): Promise<PortraitVariant[]> {
    // 通过 character 关联查询
    const rows = this.db.prepare(
      `SELECT pv.* FROM portrait_variants pv
       JOIN portrait_characters pc ON pv.character_id = pc.id
       WHERE pc.project_id = ?
       ORDER BY pv.created_at DESC`
    ).all(projectId) as any[]

    return rows.map(row => this.rowToVariant(row))
  }

  /**
   * @deprecated 使用 deleteByCharacterId 替代
   */
  async deleteByProjectId(projectId: string): Promise<void> {
    // 删除项目下所有角色的变体
    this.db.prepare(
      `DELETE FROM portrait_variants WHERE character_id IN
       (SELECT id FROM portrait_characters WHERE project_id = ?)`
    ).run(projectId)
  }

  /**
   * @deprecated 使用 countByCharacterId 替代
   */
  async countByProjectId(projectId: string): Promise<number> {
    const row = this.db.prepare(
      `SELECT COUNT(*) as count FROM portrait_variants pv
       JOIN portrait_characters pc ON pv.character_id = pc.id
       WHERE pc.project_id = ?`
    ).get(projectId) as { count: number }
    return row?.count || 0
  }
}