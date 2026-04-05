/**
 * 角色形象绑定仓库
 * @module database/repositories/character-binding.repository
 */

import Database from 'better-sqlite3'
import {
  CharacterBinding,
  CharacterBindingRecord
} from '../../../shared/types/story-to-video.types'

/**
 * 创建角色绑定请求
 */
export interface CreateCharacterBindingRequest {
  projectId: string
  longWritingCharacterId: string
  portraitId?: string
  generateConfig?: CharacterBinding['generateConfig']
  voiceConfig: CharacterBinding['voiceConfig']
}

/**
 * 更新角色绑定请求
 */
export interface UpdateCharacterBindingRequest {
  portraitId?: string | null
  generateConfig?: CharacterBinding['generateConfig'] | null
  voiceConfig?: CharacterBinding['voiceConfig']
}

/**
 * 角色形象绑定仓库
 */
export class CharacterBindingRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有角色绑定
   */
  getByProjectId(projectId: string): CharacterBinding[] {
    const stmt = this.db.prepare(`
      SELECT * FROM character_bindings WHERE project_id = ?
    `)
    const rows = stmt.all(projectId) as CharacterBindingRecord[]
    return rows.map(this.mapToBinding)
  }

  /**
   * 根据 ID 获取角色绑定
   */
  getById(id: string): CharacterBinding | null {
    const stmt = this.db.prepare(`
      SELECT * FROM character_bindings WHERE id = ?
    `)
    const row = stmt.get(id) as CharacterBindingRecord | undefined
    return row ? this.mapToBinding(row) : null
  }

  /**
   * 根据长文角色 ID 获取绑定
   */
  getByLongWritingCharacterId(
    projectId: string,
    longWritingCharacterId: string
  ): CharacterBinding | null {
    const stmt = this.db.prepare(`
      SELECT * FROM character_bindings
      WHERE project_id = ? AND long_writing_character_id = ?
    `)
    const row = stmt.get(projectId, longWritingCharacterId) as CharacterBindingRecord | undefined
    return row ? this.mapToBinding(row) : null
  }

  /**
   * 创建角色绑定
   */
  create(data: CreateCharacterBindingRequest): CharacterBinding {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO character_bindings (id, project_id, long_writing_character_id, portrait_id, generate_config, voice_config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.projectId,
      data.longWritingCharacterId,
      data.portraitId || null,
      data.generateConfig ? JSON.stringify(data.generateConfig) : null,
      JSON.stringify(data.voiceConfig),
      now,
      now
    )

    return {
      id,
      projectId: data.projectId,
      longWritingCharacterId: data.longWritingCharacterId,
      portraitId: data.portraitId,
      generateConfig: data.generateConfig,
      voiceConfig: data.voiceConfig,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新角色绑定
   */
  update(id: string, data: UpdateCharacterBindingRequest): CharacterBinding | null {
    const binding = this.getById(id)
    if (!binding) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.portraitId !== undefined) {
      updates.push('portrait_id = ?')
      values.push(data.portraitId || null)
    }
    if (data.generateConfig !== undefined) {
      updates.push('generate_config = ?')
      values.push(data.generateConfig ? JSON.stringify(data.generateConfig) : null)
    }
    if (data.voiceConfig !== undefined) {
      updates.push('voice_config = ?')
      values.push(JSON.stringify(data.voiceConfig))
    }

    if (updates.length === 0) return binding

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE character_bindings SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除角色绑定
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM character_bindings WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 根据项目 ID 删除所有角色绑定
   */
  deleteByProjectId(projectId: string): number {
    const stmt = this.db.prepare('DELETE FROM character_bindings WHERE project_id = ?')
    const result = stmt.run(projectId)
    return result.changes
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `cb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到角色绑定对象
   */
  private mapToBinding(row: CharacterBindingRecord): CharacterBinding {
    return {
      id: row.id,
      projectId: row.project_id,
      longWritingCharacterId: row.long_writing_character_id,
      portraitId: row.portrait_id || undefined,
      generateConfig: row.generate_config ? JSON.parse(row.generate_config) : undefined,
      voiceConfig: JSON.parse(row.voice_config),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}