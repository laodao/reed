/**
 * 日记条目数据访问层
 * @module database/repositories/diary-entry.repository
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  DiaryEntry,
  DiaryEntryListItem,
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest
} from '@shared/types/diary.types'

export class DiaryEntryRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为 DiaryEntry 对象
   */
  private rowToEntity(row: any): DiaryEntry {
    return {
      id: row.id,
      folderId: row.folder_id,
      title: row.title,
      content: row.content || undefined,
      filePath: row.file_path,
      wordCount: row.word_count || 0,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      frontmatter: row.frontmatter || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  /**
   * 将数据库行转换为 DiaryEntryListItem 对象
   */
  private rowToListItem(row: any): DiaryEntryListItem {
    const content = row.content || ''
    return {
      id: row.id,
      folderId: row.folder_id,
      title: row.title,
      preview: content.slice(0, 200),
      wordCount: row.word_count || 0,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  /**
   * 获取目录下的日记列表
   */
  findByFolder(folderId: string): DiaryEntryListItem[] {
    const rows = this.db.prepare(`
      SELECT id, folder_id, title, content, file_path, word_count, tags, created_at, updated_at
      FROM diary_entries
      WHERE folder_id = ?
      ORDER BY created_at DESC
    `).all(folderId) as any[]
    return rows.map(row => this.rowToListItem(row))
  }

  /**
   * 获取所有日记列表（按时间倒序）
   */
  findAll(limit?: number): DiaryEntryListItem[] {
    const sql = limit
      ? `SELECT id, folder_id, title, content, file_path, word_count, tags, created_at, updated_at
         FROM diary_entries ORDER BY created_at DESC LIMIT ?`
      : `SELECT id, folder_id, title, content, file_path, word_count, tags, created_at, updated_at
         FROM diary_entries ORDER BY created_at DESC`
    const rows = this.db.prepare(sql).all(...(limit ? [limit] : [])) as any[]
    return rows.map(row => this.rowToListItem(row))
  }

  /**
   * 根据 ID 获取日记详情
   */
  findById(id: string): DiaryEntry | null {
    const row = this.db.prepare(`
      SELECT * FROM diary_entries WHERE id = ?
    `).get(id) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 根据标题搜索日记
   */
  findByTitle(title: string): DiaryEntry | null {
    const row = this.db.prepare(`
      SELECT * FROM diary_entries WHERE title = ?
    `).get(title) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 模糊搜索日记
   */
  search(keyword: string, folderId?: string): DiaryEntryListItem[] {
    const pattern = `%${keyword}%`
    let sql: string
    let params: any[]

    if (folderId) {
      sql = `
        SELECT id, folder_id, title, content, file_path, word_count, tags, created_at, updated_at
        FROM diary_entries
        WHERE folder_id = ? AND (title LIKE ? OR content LIKE ?)
        ORDER BY created_at DESC
      `
      params = [folderId, pattern, pattern]
    } else {
      sql = `
        SELECT id, folder_id, title, content, file_path, word_count, tags, created_at, updated_at
        FROM diary_entries
        WHERE title LIKE ? OR content LIKE ?
        ORDER BY created_at DESC
      `
      params = [pattern, pattern]
    }

    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map(row => this.rowToListItem(row))
  }

  /**
   * 创建日记
   */
  create(request: CreateDiaryEntryRequest, filePath: string): DiaryEntry {
    const id = randomUUID()
    const now = new Date().toISOString()
    const title = request.title || this.generateDefaultTitle()

    this.db.prepare(`
      INSERT INTO diary_entries (id, folder_id, title, content, file_path, word_count, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)
    `).run(
      id,
      request.folderId,
      title,
      request.content || '',
      filePath,
      now,
      now
    )

    return {
      id,
      folderId: request.folderId,
      title,
      content: request.content,
      filePath,
      wordCount: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    }
  }

  /**
   * 更新日记
   */
  update(id: string, request: UpdateDiaryEntryRequest): boolean {
    const fields: string[] = []
    const values: any[] = []

    if (request.title !== undefined) {
      fields.push('title = ?')
      values.push(request.title)
    }
    if (request.content !== undefined) {
      fields.push('content = ?')
      values.push(request.content)
      fields.push('word_count = ?')
      values.push(this.countWords(request.content))
    }
    if (request.tags !== undefined) {
      fields.push('tags = ?')
      values.push(JSON.stringify(request.tags))
    }

    if (fields.length === 0) return false

    fields.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    const result = this.db.prepare(
      `UPDATE diary_entries SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values)

    return result.changes > 0
  }

  /**
   * 移动日记到其他目录
   */
  move(id: string, targetFolderId: string, newFilePath: string): boolean {
    const result = this.db.prepare(`
      UPDATE diary_entries
      SET folder_id = ?, file_path = ?, updated_at = ?
      WHERE id = ?
    `).run(targetFolderId, newFilePath, new Date().toISOString(), id)

    return result.changes > 0
  }

  /**
   * 删除日记
   */
  delete(id: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM diary_entries WHERE id = ?'
    ).run(id)
    return result.changes > 0
  }

  /**
   * 统计日记数量
   */
  count(folderId?: string): number {
    const sql = folderId
      ? 'SELECT COUNT(*) as count FROM diary_entries WHERE folder_id = ?'
      : 'SELECT COUNT(*) as count FROM diary_entries'
    const row = this.db.prepare(sql).get(...(folderId ? [folderId] : [])) as { count: number }
    return row?.count || 0
  }

  /**
   * 生成默认标题（使用日期）
   */
  private generateDefaultTitle(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  /**
   * 计算字数
   */
  private countWords(content: string): number {
    const text = content
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*_~>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return text.length
  }
}