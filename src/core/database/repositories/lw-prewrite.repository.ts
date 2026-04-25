/**
 * 长文写作章节预写仓库
 * @module database/repositories/lw-prewrite.repository
 */

import Database from 'better-sqlite3'
import {
  ChapterPrewrite,
  CreatePrewriteRequest,
  UpdatePrewriteRequest
} from '@shared/types/longwriting.types'

export class LwPrewriteRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据大纲 ID 获取预写
   */
  getByOutlineId(outlineId: string): ChapterPrewrite | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_chapter_prewrites WHERE outline_id = ?
    `)
    const row = stmt.get(outlineId) as any
    return row ? this.mapToPrewrite(row) : null
  }

  /**
   * 根据 ID 获取预写
   */
  getById(id: string): ChapterPrewrite | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_chapter_prewrites WHERE id = ?
    `)
    const row = stmt.get(id) as any
    return row ? this.mapToPrewrite(row) : null
  }

  /**
   * 批量根据大纲 ID 获取预写
   */
  getByOutlineIds(outlineIds: string[]): Map<string, ChapterPrewrite> {
    if (outlineIds.length === 0) return new Map()

    const placeholders = outlineIds.map(() => '?').join(',')
    const stmt = this.db.prepare(`
      SELECT * FROM lw_chapter_prewrites WHERE outline_id IN (${placeholders})
    `)
    const rows = stmt.all(...outlineIds) as any[]

    const result = new Map<string, ChapterPrewrite>()
    for (const row of rows) {
      const prewrite = this.mapToPrewrite(row)
      result.set(prewrite.outlineId, prewrite)
    }
    return result
  }

  /**
   * 创建预写
   */
  create(data: CreatePrewriteRequest): ChapterPrewrite {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO lw_chapter_prewrites (id, outline_id, content, is_confirmed, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?)
    `)
    stmt.run(id, data.outlineId, data.content, now, now)

    return {
      id,
      outlineId: data.outlineId,
      content: data.content,
      isConfirmed: false,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新预写
   */
  update(outlineId: string, data: UpdatePrewriteRequest): ChapterPrewrite | null {
    const prewrite = this.getByOutlineId(outlineId)
    if (!prewrite) return null

    const now = Date.now()
    const updates: string[] = []
    const values: any[] = []

    if (data.content !== undefined) {
      updates.push('content = ?')
      values.push(data.content)
    }

    if (updates.length === 0) return prewrite

    updates.push('updated_at = ?')
    values.push(now)
    values.push(outlineId)

    const stmt = this.db.prepare(`
      UPDATE lw_chapter_prewrites SET ${updates.join(', ')} WHERE outline_id = ?
    `)
    stmt.run(...values)

    return this.getByOutlineId(outlineId)
  }

  /**
   * 确认预写
   */
  confirm(outlineId: string): ChapterPrewrite | null {
    const prewrite = this.getByOutlineId(outlineId)
    if (!prewrite) return null

    const now = Date.now()
    const stmt = this.db.prepare(`
      UPDATE lw_chapter_prewrites SET is_confirmed = 1, confirmed_at = ?, updated_at = ? WHERE outline_id = ?
    `)
    stmt.run(now, now, outlineId)

    return this.getByOutlineId(outlineId)
  }

  /**
   * 取消确认预写
   */
  unconfirm(outlineId: string): ChapterPrewrite | null {
    const prewrite = this.getByOutlineId(outlineId)
    if (!prewrite) return null

    const now = Date.now()
    const stmt = this.db.prepare(`
      UPDATE lw_chapter_prewrites SET is_confirmed = 0, confirmed_at = NULL, updated_at = ? WHERE outline_id = ?
    `)
    stmt.run(now, outlineId)

    return this.getByOutlineId(outlineId)
  }

  /**
   * 删除预写
   */
  delete(outlineId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_chapter_prewrites WHERE outline_id = ?')
    const result = stmt.run(outlineId)
    return result.changes > 0
  }

  /**
   * 保存或更新预写（如果存在则更新，不存在则创建）
   */
  save(data: CreatePrewriteRequest): ChapterPrewrite {
    const existing = this.getByOutlineId(data.outlineId)
    if (existing) {
      return this.update(data.outlineId, { content: data.content })!
    }
    return this.create(data)
  }

  private generateId(): string {
    return `prewrite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private mapToPrewrite(row: any): ChapterPrewrite {
    return {
      id: row.id,
      outlineId: row.outline_id,
      content: row.content || '',
      isConfirmed: !!row.is_confirmed,
      confirmedAt: row.confirmed_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}