/**
 * 复刻声音数据访问层
 * @module database/repositories/cloned-voice
 * @description 提供复刻声音的数据库操作
 */

import Database from 'better-sqlite3'
import type { ClonedVoice, ClonedVoiceStatus } from '@shared/types/voice.types'
import { randomUUID } from 'crypto'

/**
 * 复刻声音数据仓库
 */
export class ClonedVoiceRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 初始化表结构
   */
  static initTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cloned_voices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'training',
        sample_audio_path TEXT,
        sample_duration INTEGER,
        voice_id TEXT,
        preview_audio_path TEXT,
        provider_id TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      )
    `)

    // 创建索引
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cloned_voices_status ON cloned_voices(status)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cloned_voices_created_at ON cloned_voices(created_at DESC)`)
  }

  /**
   * 将数据库行转换为 ClonedVoice 对象
   */
  private rowToRecord(row: any): ClonedVoice {
    return {
      id: row.id,
      name: row.name,
      status: row.status as ClonedVoiceStatus,
      sampleAudioPath: row.sample_audio_path || undefined,
      sampleDuration: row.sample_duration ?? undefined,
      voiceId: row.voice_id || undefined,
      previewAudioPath: row.preview_audio_path || undefined,
      providerId: row.provider_id || undefined,
      errorMessage: row.error_message || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined
    }
  }

  /**
   * 获取所有复刻声音
   */
  getAll(): ClonedVoice[] {
    const rows = this.db.prepare(
      `SELECT * FROM cloned_voices ORDER BY created_at DESC`
    ).all() as any[]
    return rows.map(row => this.rowToRecord(row))
  }

  /**
   * 获取指定状态的复刻声音
   */
  getByStatus(status: ClonedVoiceStatus): ClonedVoice[] {
    const rows = this.db.prepare(
      `SELECT * FROM cloned_voices WHERE status = ? ORDER BY created_at DESC`
    ).all(status) as any[]
    return rows.map(row => this.rowToRecord(row))
  }

  /**
   * 根据 ID 获取复刻声音
   */
  getById(id: string): ClonedVoice | null {
    const row = this.db.prepare('SELECT * FROM cloned_voices WHERE id = ?').get(id) as any
    if (!row) return null
    return this.rowToRecord(row)
  }

  /**
   * 根据 voiceId 获取复刻声音
   */
  getByVoiceId(voiceId: string): ClonedVoice | null {
    const row = this.db.prepare('SELECT * FROM cloned_voices WHERE voice_id = ?').get(voiceId) as any
    if (!row) return null
    return this.rowToRecord(row)
  }

  /**
   * 创建复刻声音
   */
  create(record: Omit<ClonedVoice, 'id' | 'createdAt'>): ClonedVoice {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO cloned_voices (
        id, name, status, sample_audio_path, sample_duration,
        voice_id, preview_audio_path, provider_id, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      record.name,
      record.status,
      record.sampleAudioPath || null,
      record.sampleDuration || null,
      record.voiceId || null,
      record.previewAudioPath || null,
      record.providerId || null,
      record.errorMessage || null,
      now,
      record.updatedAt?.toISOString() || null
    )

    return {
      id,
      ...record,
      createdAt: new Date(now)
    }
  }

  /**
   * 更新复刻声音
   */
  update(id: string, data: Partial<ClonedVoice>): void {
    const fields: string[] = []
    const values: any[] = []

    if (data.status !== undefined) {
      fields.push('status = ?')
      values.push(data.status)
    }
    if (data.voiceId !== undefined) {
      fields.push('voice_id = ?')
      values.push(data.voiceId || null)
    }
    if (data.previewAudioPath !== undefined) {
      fields.push('preview_audio_path = ?')
      values.push(data.previewAudioPath || null)
    }
    if (data.errorMessage !== undefined) {
      fields.push('error_message = ?')
      values.push(data.errorMessage || null)
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(id)
      this.db.prepare(`UPDATE cloned_voices SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
  }

  /**
   * 删除复刻声音
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM cloned_voices WHERE id = ?').run(id)
  }

  /**
   * 统计复刻声音数量
   */
  count(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM cloned_voices`).get() as { count: number }
    return row?.count || 0
  }
}