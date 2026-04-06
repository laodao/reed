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
   * 同时写入JSON字段和规范化字段
   */
  create(data: CreateCharacterBindingRequest): CharacterBinding {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO character_bindings (
        id, project_id, long_writing_character_id, portrait_id,
        generate_config, voice_config,
        voice_id, voice_speed, voice_pitch,
        base_description, style_reference, additional_prompts,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.projectId,
      data.longWritingCharacterId,
      data.portraitId || null,
      data.generateConfig ? JSON.stringify(data.generateConfig) : null,
      JSON.stringify(data.voiceConfig),
      // 规范化字段
      data.voiceConfig?.voiceId || null,
      data.voiceConfig?.speed || 1.0,
      data.voiceConfig?.pitch || 1.0,
      data.generateConfig?.baseDescription || null,
      data.generateConfig?.styleReference || null,
      data.generateConfig?.additionalPrompts || null,
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
   * 同时更新JSON字段和规范化字段
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
      // 同时更新规范化字段
      updates.push('base_description = ?')
      values.push(data.generateConfig?.baseDescription || null)
      updates.push('style_reference = ?')
      values.push(data.generateConfig?.styleReference || null)
      updates.push('additional_prompts = ?')
      values.push(data.generateConfig?.additionalPrompts || null)
    }
    if (data.voiceConfig !== undefined) {
      updates.push('voice_config = ?')
      values.push(JSON.stringify(data.voiceConfig))
      // 同时更新规范化字段
      updates.push('voice_id = ?')
      values.push(data.voiceConfig?.voiceId || null)
      updates.push('voice_speed = ?')
      values.push(data.voiceConfig?.speed || 1.0)
      updates.push('voice_pitch = ?')
      values.push(data.voiceConfig?.pitch || 1.0)
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
   * 优先使用规范化字段，回退到JSON字段
   */
  private mapToBinding(row: CharacterBindingRecord): CharacterBinding {
    // 构建声音配置：优先使用规范化字段
    let voiceConfig: CharacterBinding['voiceConfig']
    if (row.voice_id || row.voice_speed || row.voice_pitch) {
      voiceConfig = {
        voiceId: row.voice_id || '',
        speed: row.voice_speed ?? 1.0,
        pitch: row.voice_pitch ?? 1.0
      }
    } else if (row.voice_config) {
      voiceConfig = JSON.parse(row.voice_config)
    } else {
      voiceConfig = { voiceId: '', speed: 1.0, pitch: 1.0 }
    }

    // 构建生成配置：优先使用规范化字段
    let generateConfig: CharacterBinding['generateConfig'] | undefined
    if (row.base_description || row.style_reference || row.additional_prompts) {
      generateConfig = {
        baseDescription: row.base_description || '',
        styleReference: row.style_reference || undefined,
        additionalPrompts: row.additional_prompts || undefined
      }
    } else if (row.generate_config) {
      generateConfig = JSON.parse(row.generate_config)
    }

    return {
      id: row.id,
      projectId: row.project_id,
      longWritingCharacterId: row.long_writing_character_id,
      portraitId: row.portrait_id || undefined,
      generateConfig,
      voiceConfig,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}