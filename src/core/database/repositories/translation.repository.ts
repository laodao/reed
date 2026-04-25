/**
 * 翻译数据访问层
 * @module database/repositories/translation
 * @description 提供翻译记录的数据库操作
 */

import Database from 'better-sqlite3'
import type { TranslationRecord, TranslationHistoryQuery } from '@shared/types/translation.types'
import { randomUUID } from 'crypto'

/**
 * 翻译数据仓库
 */
export class TranslationRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 初始化表结构
   */
  static initTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS translations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        source_language TEXT NOT NULL,
        target_language TEXT NOT NULL,
        source_text TEXT,
        target_text TEXT,
        source_file TEXT,
        source_file_name TEXT,
        target_file TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        favorite INTEGER NOT NULL DEFAULT 0,
        word_count INTEGER NOT NULL DEFAULT 0,
        provider_id TEXT,
        model_id TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL
      )
    `)

    // 创建索引
    db.exec(`CREATE INDEX IF NOT EXISTS idx_translations_created_at ON translations(created_at DESC)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_translations_type ON translations(type)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_translations_favorite ON translations(favorite)`)
  }

  /**
   * 将数据库行转换为 TranslationRecord 对象
   * @param row - 数据库行
   * @returns TranslationRecord
   */
  private rowToRecord(row: any): TranslationRecord {
    return {
      id: row.id,
      type: row.type,
      sourceLanguage: row.source_language,
      targetLanguage: row.target_language,
      sourceText: row.source_text || undefined,
      targetText: row.target_text || undefined,
      sourceFile: row.source_file || undefined,
      sourceFileName: row.source_file_name || undefined,
      targetFile: row.target_file || undefined,
      status: row.status,
      favorite: row.favorite === 1,
      wordCount: row.word_count,
      providerId: row.provider_id || undefined,
      modelId: row.model_id || undefined,
      errorMessage: row.error_message || undefined,
      createdAt: new Date(row.created_at)
    }
  }

  /**
   * 获取翻译历史列表
   * @param query - 查询参数
   * @returns 列表和总数
   */
  getList(query: TranslationHistoryQuery): { list: TranslationRecord[]; total: number } {
    const { page, pageSize, type, favorite } = query
    const offset = (page - 1) * pageSize
    const conditions: string[] = []
    const params: any[] = []

    if (type) {
      conditions.push('type = ?')
      params.push(type)
    }
    if (favorite !== undefined) {
      conditions.push('favorite = ?')
      params.push(favorite ? 1 : 0)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // 获取总数
    const countRow = this.db.prepare(
      `SELECT COUNT(*) as count FROM translations ${whereClause}`
    ).get(...params) as { count: number }
    const total = countRow?.count || 0

    // 获取列表
    const rows = this.db.prepare(
      `SELECT * FROM translations ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset) as any[]

    const list = rows.map(row => this.rowToRecord(row))

    return { list, total }
  }

  /**
   * 根据 ID 获取翻译记录
   * @param id - 记录 ID
   * @returns 翻译记录
   */
  getById(id: string): TranslationRecord | null {
    const row = this.db.prepare('SELECT * FROM translations WHERE id = ?').get(id) as any
    if (!row) return null
    return this.rowToRecord(row)
  }

  /**
   * 创建翻译记录
   * @param record - 翻译记录
   * @returns 创建的记录
   */
  create(record: Omit<TranslationRecord, 'id' | 'createdAt'>): TranslationRecord {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO translations (
        id, type, source_language, target_language,
        source_text, target_text, source_file, source_file_name, target_file,
        status, favorite, word_count, provider_id, model_id, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      record.type,
      record.sourceLanguage,
      record.targetLanguage,
      record.sourceText || null,
      record.targetText || null,
      record.sourceFile || null,
      record.sourceFileName || null,
      record.targetFile || null,
      record.status,
      record.favorite ? 1 : 0,
      record.wordCount,
      record.providerId || null,
      record.modelId || null,
      record.errorMessage || null,
      now
    )

    return {
      id,
      ...record,
      createdAt: new Date(now)
    }
  }

  /**
   * 更新翻译记录
   * @param id - 记录 ID
   * @param data - 更新数据
   */
  update(id: string, data: Partial<TranslationRecord>): void {
    const fields: string[] = []
    const values: any[] = []

    if (data.targetText !== undefined) {
      fields.push('target_text = ?')
      values.push(data.targetText || null)
    }
    if (data.targetFile !== undefined) {
      fields.push('target_file = ?')
      values.push(data.targetFile || null)
    }
    if (data.status !== undefined) {
      fields.push('status = ?')
      values.push(data.status)
    }
    if (data.favorite !== undefined) {
      fields.push('favorite = ?')
      values.push(data.favorite ? 1 : 0)
    }
    if (data.errorMessage !== undefined) {
      fields.push('error_message = ?')
      values.push(data.errorMessage || null)
    }

    if (fields.length > 0) {
      values.push(id)
      this.db.prepare(`UPDATE translations SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
  }

  /**
   * 删除翻译记录
   * @param id - 记录 ID
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM translations WHERE id = ?').run(id)
  }

  /**
   * 切换收藏状态
   * @param id - 记录 ID
   * @returns 新的收藏状态
   */
  toggleFavorite(id: string): boolean {
    const record = this.getById(id)
    if (!record) {
      throw new Error('Translation record not found')
    }
    const newFavorite = !record.favorite
    this.update(id, { favorite: newFavorite })
    return newFavorite
  }

  /**
   * 统计翻译数量
   * @param favoriteOnly - 只统计收藏
   * @returns 数量
   */
  count(favoriteOnly: boolean = false): number {
    const whereClause = favoriteOnly ? 'WHERE favorite = 1' : ''
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM translations ${whereClause}`).get() as { count: number }
    return row?.count || 0
  }
}