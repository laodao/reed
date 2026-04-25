/**
 * 地图仓库
 * @module database/repositories/lw-map.repository
 */

import Database from 'better-sqlite3'
import { StoryMap, MapOrientation, MapGeneratedData } from '@shared/types/longwriting.types'

/**
 * 地图仓库
 */
export class LwMapRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有地图
   */
  getByProjectId(projectId: string): StoryMap[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_project_maps WHERE project_id = ? ORDER BY sort_order ASC, created_at DESC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(this.mapToMap)
  }

  /**
   * 根据 ID 获取地图
   */
  getById(id: string): StoryMap | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_project_maps WHERE id = ?`)
    const row = stmt.get(id) as any
    return row ? this.mapToMap(row) : null
  }

  /**
   * 创建地图
   */
  create(data: {
    projectId: string
    name: string
    orientation?: MapOrientation
    characteristics?: string
    sortOrder?: number
  }): StoryMap {
    const id = this.generateId()
    const now = Date.now()
    const sortOrder = data.sortOrder ?? 0

    const stmt = this.db.prepare(`
      INSERT INTO lw_project_maps (id, project_id, name, orientation, characteristics, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(id, data.projectId, data.name, data.orientation || 'other', data.characteristics || '', sortOrder, now, now)

    return {
      id,
      projectId: data.projectId,
      name: data.name,
      orientation: data.orientation || 'other',
      characteristics: data.characteristics || '',
      sortOrder,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新地图
   */
  update(id: string, data: Partial<StoryMap>): StoryMap | null {
    const existing = this.getById(id)
    if (!existing) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }
    if (data.orientation !== undefined) {
      updates.push('orientation = ?')
      values.push(data.orientation)
    }
    if (data.characteristics !== undefined) {
      updates.push('characteristics = ?')
      values.push(data.characteristics)
    }
    if (data.imagePath !== undefined) {
      updates.push('image_path = ?')
      values.push(data.imagePath)
    }
    if (data.aiGeneratedData !== undefined) {
      updates.push('ai_generated_data = ?')
      values.push(data.aiGeneratedData ? JSON.stringify(data.aiGeneratedData) : null)
    }
    if (data.sortOrder !== undefined) {
      updates.push('sort_order = ?')
      values.push(data.sortOrder)
    }

    if (updates.length === 0) return existing

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_project_maps SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 更新地图图片路径
   */
  updateImagePath(id: string, imagePath: string | null): boolean {
    const stmt = this.db.prepare(`
      UPDATE lw_project_maps SET image_path = ?, updated_at = ? WHERE id = ?
    `)
    const result = stmt.run(imagePath, Date.now(), id)
    return result.changes > 0
  }

  /**
   * 更新 AI 生成的地图数据
   */
  updateAIGeneratedData(id: string, data: MapGeneratedData | null): boolean {
    const stmt = this.db.prepare(`
      UPDATE lw_project_maps SET ai_generated_data = ?, updated_at = ? WHERE id = ?
    `)
    const result = stmt.run(data ? JSON.stringify(data) : null, Date.now(), id)
    return result.changes > 0
  }

  /**
   * 删除地图
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_project_maps WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 批量更新排序
   */
  updateSortOrder(orderList: { id: string; order: number }[]): boolean {
    const stmt = this.db.prepare(`
      UPDATE lw_project_maps SET sort_order = ?, updated_at = ? WHERE id = ?
    `)

    const transaction = this.db.transaction(() => {
      for (const item of orderList) {
        stmt.run(item.order, Date.now(), item.id)
      }
    })

    transaction()
    return true
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `map_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到对象
   */
  private mapToMap(row: any): StoryMap {
    let aiGeneratedData: MapGeneratedData | undefined = undefined
    if (row.ai_generated_data) {
      try {
        aiGeneratedData = JSON.parse(row.ai_generated_data)
      } catch (e) {
        console.error('[LwMapRepository] 解析 AI 生成数据失败:', e)
      }
    }

    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      orientation: row.orientation as MapOrientation,
      characteristics: row.characteristics,
      imagePath: row.image_path,
      aiGeneratedData,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}