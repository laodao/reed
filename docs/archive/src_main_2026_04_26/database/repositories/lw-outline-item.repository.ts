/**
 * 大纲物品关联仓库
 * @module database/repositories/lw-outline-item.repository
 * 符合第三范式，替代JSON存储
 */

import Database from 'better-sqlite3'

/**
 * 大纲物品关联
 */
export interface OutlineItemRelation {
  id: string
  outlineId: string
  itemId: string
  createdAt: number
}

/**
 * 大纲物品关联仓库
 */
export class LwOutlineItemRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据大纲ID获取所有关联的物品ID
   */
  getItemIdsByOutlineId(outlineId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT item_id FROM lw_outline_items WHERE outline_id = ?
    `)
    const rows = stmt.all(outlineId) as any[]
    return rows.map(row => row.item_id)
  }

  /**
   * 根据物品ID获取所有关联的大纲ID
   */
  getOutlineIdsByItemId(itemId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT outline_id FROM lw_outline_items WHERE item_id = ?
    `)
    const rows = stmt.all(itemId) as any[]
    return rows.map(row => row.outline_id)
  }

  /**
   * 批量获取大纲的物品ID映射
   * @param outlineIds 大纲ID列表
   * @returns Map<outlineId, itemId[]>
   */
  getItemIdsByOutlineIds(outlineIds: string[]): Map<string, string[]> {
    const result = new Map<string, string[]>()

    if (outlineIds.length === 0) return result

    const placeholders = outlineIds.map(() => '?').join(',')
    const stmt = this.db.prepare(`
      SELECT outline_id, item_id FROM lw_outline_items WHERE outline_id IN (${placeholders})
    `)
    const rows = stmt.all(...outlineIds) as any[]

    for (const row of rows) {
      if (!result.has(row.outline_id)) {
        result.set(row.outline_id, [])
      }
      result.get(row.outline_id)!.push(row.item_id)
    }

    // 确保所有大纲都有条目
    for (const outlineId of outlineIds) {
      if (!result.has(outlineId)) {
        result.set(outlineId, [])
      }
    }

    return result
  }

  /**
   * 添加大纲物品关联
   */
  add(outlineId: string, itemId: string): OutlineItemRelation {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_outline_items (id, outline_id, item_id, created_at)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(id, outlineId, itemId, now)

    return { id, outlineId, itemId, createdAt: now }
  }

  /**
   * 批量添加大纲物品关联（事务）
   */
  batchAdd(outlineId: string, itemIds: string[]): void {
    if (itemIds.length === 0) return

    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lw_outline_items (id, outline_id, item_id, created_at)
      VALUES (?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      for (const itemId of itemIds) {
        const id = this.generateId()
        stmt.run(id, outlineId, itemId, now)
      }
    })

    transaction()
  }

  /**
   * 替换大纲的所有物品关联
   */
  replaceAll(outlineId: string, itemIds: string[]): void {
    const transaction = this.db.transaction(() => {
      // 先删除现有关联
      this.deleteByOutlineId(outlineId)
      // 再添加新关联
      this.batchAdd(outlineId, itemIds)
    })
    transaction()
  }

  /**
   * 删除大纲物品关联
   */
  delete(outlineId: string, itemId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM lw_outline_items WHERE outline_id = ? AND item_id = ?
    `)
    const result = stmt.run(outlineId, itemId)
    return result.changes > 0
  }

  /**
   * 删除大纲的所有物品关联
   */
  deleteByOutlineId(outlineId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_outline_items WHERE outline_id = ?')
    const result = stmt.run(outlineId)
    return result.changes
  }

  /**
   * 删除物品的所有大纲关联
   */
  deleteByItemId(itemId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_outline_items WHERE item_id = ?')
    const result = stmt.run(itemId)
    return result.changes
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `oi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}