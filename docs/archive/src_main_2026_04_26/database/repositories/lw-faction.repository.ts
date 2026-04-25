/**
 * 势力仓库
 * @module database/repositories/lw-faction.repository
 */

import Database from 'better-sqlite3'
import { StoryFaction, FactionType } from '../../../shared/types/longwriting.types'

/**
 * 势力仓库
 */
export class LwFactionRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有势力
   */
  getByProjectId(projectId: string): StoryFaction[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_project_factions WHERE project_id = ? ORDER BY sort_order ASC, created_at DESC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(this.mapToFaction)
  }

  /**
   * 根据项目 ID 和势力类型获取势力
   */
  getByProjectIdAndType(projectId: string, factionType: FactionType): StoryFaction[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_project_factions WHERE project_id = ? AND faction_type = ? ORDER BY sort_order ASC, created_at DESC
    `)
    const rows = stmt.all(projectId, factionType) as any[]
    return rows.map(this.mapToFaction)
  }

  /**
   * 根据 ID 获取势力
   */
  getById(id: string): StoryFaction | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_project_factions WHERE id = ?`)
    const row = stmt.get(id) as any
    return row ? this.mapToFaction(row) : null
  }

  /**
   * 创建势力
   */
  create(data: {
    projectId: string
    factionType: FactionType
    name: string
    locationId?: string
    description: string
    sortOrder?: number
  }): StoryFaction {
    const id = this.generateId()
    const now = Date.now()
    const sortOrder = data.sortOrder ?? 0

    // 处理 locationId：空字符串转为 null
    const locationId = data.locationId && data.locationId.trim() !== '' ? data.locationId : null

    const stmt = this.db.prepare(`
      INSERT INTO lw_project_factions (id, project_id, faction_type, name, location_id, description, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(id, data.projectId, data.factionType, data.name, locationId, data.description, sortOrder, now, now)

    return {
      id,
      projectId: data.projectId,
      factionType: data.factionType,
      name: data.name,
      locationId: locationId ?? undefined,
      description: data.description,
      sortOrder,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新势力
   */
  update(id: string, data: Partial<StoryFaction>): StoryFaction | null {
    const existing = this.getById(id)
    if (!existing) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.factionType !== undefined) {
      updates.push('faction_type = ?')
      values.push(data.factionType)
    }
    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }
    if (data.locationId !== undefined) {
      updates.push('location_id = ?')
      // 处理 locationId：空字符串转为 null
      const locationId = data.locationId && data.locationId.trim() !== '' ? data.locationId : null
      values.push(locationId)
    }
    if (data.description !== undefined) {
      updates.push('description = ?')
      values.push(data.description)
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
      UPDATE lw_project_factions SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除势力
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_project_factions WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 批量更新排序
   */
  updateSortOrder(orderList: { id: string; order: number }[]): boolean {
    const stmt = this.db.prepare(`
      UPDATE lw_project_factions SET sort_order = ?, updated_at = ? WHERE id = ?
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
    return `fac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到对象
   */
  private mapToFaction(row: any): StoryFaction {
    return {
      id: row.id,
      projectId: row.project_id,
      factionType: row.faction_type as FactionType,
      name: row.name,
      locationId: row.location_id,
      description: row.description,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}