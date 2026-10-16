/**
 * 语音记录数据访问层
 * @module database/repositories/voice
 * @description 提供语音记录的数据库操作
 */

import Database from 'better-sqlite3'
import type { VoiceRecord, VoiceHistoryQuery } from '../../../shared/types/voice.types'
import { randomUUID } from 'crypto'

/**
 * 语音数据仓库
 */
export class VoiceRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 初始化表结构
   */
  static initTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS voice_records (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',

        -- TTS 相关
        input_text TEXT,
        output_audio_path TEXT,
        voice_id TEXT,
        voice_name TEXT,
        language TEXT,
        speed REAL DEFAULT 1.0,
        pitch REAL DEFAULT 0,
        volume REAL DEFAULT 1.0,
        emotion TEXT,
        style TEXT,
        duration INTEGER,

        -- STT 相关
        input_audio_path TEXT,
        output_text TEXT,

        -- 通用
        provider_id TEXT,
        model_id TEXT,
        favorite INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL
      )
    `)

    // 创建索引
    db.exec(`CREATE INDEX IF NOT EXISTS idx_voice_records_created_at ON voice_records(created_at DESC)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_voice_records_type ON voice_records(type)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_voice_records_favorite ON voice_records(favorite)`)
  }

  /**
   * 将数据库行转换为 VoiceRecord 对象
   */
  private rowToRecord(row: any): VoiceRecord {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      inputText: row.input_text || undefined,
      outputAudioPath: row.output_audio_path || undefined,
      voiceId: row.voice_id || undefined,
      voiceName: row.voice_name || undefined,
      language: row.language || undefined,
      speed: row.speed ?? undefined,
      pitch: row.pitch ?? undefined,
      volume: row.volume ?? undefined,
      emotion: row.emotion || undefined,
      style: row.style || undefined,
      duration: row.duration ?? undefined,
      inputAudioPath: row.input_audio_path || undefined,
      outputText: row.output_text || undefined,
      providerId: row.provider_id || undefined,
      modelId: row.model_id || undefined,
      favorite: row.favorite === 1,
      errorMessage: row.error_message || undefined,
      createdAt: new Date(row.created_at)
    }
  }

  /**
   * 获取语音历史列表
   */
  getList(query: VoiceHistoryQuery): { list: VoiceRecord[]; total: number } {
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
      `SELECT COUNT(*) as count FROM voice_records ${whereClause}`
    ).get(...params) as { count: number }
    const total = countRow?.count || 0

    // 获取列表
    const rows = this.db.prepare(
      `SELECT * FROM voice_records ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset) as any[]

    const list = rows.map(row => this.rowToRecord(row))

    return { list, total }
  }

  /**
   * 根据 ID 获取语音记录
   */
  getById(id: string): VoiceRecord | null {
    const row = this.db.prepare('SELECT * FROM voice_records WHERE id = ?').get(id) as any
    if (!row) return null
    return this.rowToRecord(row)
  }

  /**
   * 创建语音记录
   */
  create(record: Omit<VoiceRecord, 'id' | 'createdAt'>): VoiceRecord {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO voice_records (
        id, type, status,
        input_text, output_audio_path, voice_id, voice_name, language,
        speed, pitch, volume, emotion, style, duration,
        input_audio_path, output_text,
        provider_id, model_id, favorite, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      record.type,
      record.status,
      record.inputText || null,
      record.outputAudioPath || null,
      record.voiceId || null,
      record.voiceName || null,
      record.language || null,
      record.speed ?? 1.0,
      record.pitch ?? 0,
      record.volume ?? 1.0,
      record.emotion || null,
      record.style || null,
      record.duration || null,
      record.inputAudioPath || null,
      record.outputText || null,
      record.providerId || null,
      record.modelId || null,
      record.favorite ? 1 : 0,
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
   * 更新语音记录
   */
  update(id: string, data: Partial<VoiceRecord>): void {
    const fields: string[] = []
    const values: any[] = []

    if (data.status !== undefined) {
      fields.push('status = ?')
      values.push(data.status)
    }
    if (data.outputAudioPath !== undefined) {
      fields.push('output_audio_path = ?')
      values.push(data.outputAudioPath || null)
    }
    if (data.outputText !== undefined) {
      fields.push('output_text = ?')
      values.push(data.outputText || null)
    }
    if (data.duration !== undefined) {
      fields.push('duration = ?')
      values.push(data.duration)
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
      this.db.prepare(`UPDATE voice_records SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
  }

  /**
   * 删除语音记录
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM voice_records WHERE id = ?').run(id)
  }

  /**
   * 切换收藏状态
   */
  toggleFavorite(id: string): boolean {
    const record = this.getById(id)
    if (!record) {
      throw new Error('Voice record not found')
    }
    const newFavorite = !record.favorite
    this.update(id, { favorite: newFavorite })
    return newFavorite
  }
}