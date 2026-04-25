/**
 * 日记附件数据访问层
 * @module database/repositories/diary-attachment.repository
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { DiaryAttachment } from '@shared/types/diary.types'

export class DiaryAttachmentRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 获取日记的所有附件
   */
  findByEntry(entryId: string): DiaryAttachment[] {
    const rows = this.db.prepare(`
      SELECT * FROM diary_attachments WHERE entry_id = ?
      ORDER BY created_at DESC
    `).all(entryId) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 根据 ID 获取附件
   */
  findById(id: string): DiaryAttachment | null {
    const row = this.db.prepare(`
      SELECT * FROM diary_attachments WHERE id = ?
    `).get(id) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 创建附件记录
   */
  create(
    entryId: string,
    fileName: string,
    filePath: string,
    fileSize: number,
    mimeType?: string
  ): DiaryAttachment {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO diary_attachments (id, entry_id, file_name, file_path, file_size, mime_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entryId,
      fileName,
      filePath,
      fileSize,
      mimeType || null,
      now
    )

    return {
      id,
      entryId,
      fileName,
      filePath,
      fileSize,
      mimeType,
      createdAt: new Date(now)
    }
  }

  /**
   * 删除附件
   */
  delete(id: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM diary_attachments WHERE id = ?'
    ).run(id)
    return result.changes > 0
  }

  /**
   * 删除日记的所有附件
   */
  deleteByEntry(entryId: string): void {
    this.db.prepare(
      'DELETE FROM diary_attachments WHERE entry_id = ?'
    ).run(entryId)
  }

  /**
   * 统计附件数量
   */
  count(entryId?: string): number {
    const sql = entryId
      ? 'SELECT COUNT(*) as count FROM diary_attachments WHERE entry_id = ?'
      : 'SELECT COUNT(*) as count FROM diary_attachments'
    const row = this.db.prepare(sql).get(...(entryId ? [entryId] : [])) as { count: number }
    return row?.count || 0
  }

  /**
   * 将数据库行转换为 DiaryAttachment 对象
   */
  private rowToEntity(row: any): DiaryAttachment {
    return {
      id: row.id,
      entryId: row.entry_id,
      fileName: row.file_name,
      filePath: row.file_path,
      fileSize: row.file_size,
      mimeType: row.mime_type || undefined,
      createdAt: new Date(row.created_at)
    }
  }
}