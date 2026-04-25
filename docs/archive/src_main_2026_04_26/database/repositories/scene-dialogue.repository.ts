/**
 * 场景对话仓库
 * @module database/repositories/scene-dialogue.repository
 */

import Database from 'better-sqlite3'
import {
  Dialogue,
  SceneDialogueRecord
} from '../../../shared/types/story-to-video.types'

/**
 * 创建场景对话请求
 */
export interface CreateSceneDialogueRequest {
  sceneScriptId: string
  characterId: string
  characterName: string
  text: string
  emotion?: string
  volume?: 'normal' | 'loud' | 'whisper'
  pace?: 'normal' | 'fast' | 'slow'
  pause?: number
  voiceId?: string
  audioAssetId?: string
  sortOrder: number
}

/**
 * 更新场景对话请求
 */
export interface UpdateSceneDialogueRequest {
  characterId?: string
  characterName?: string
  text?: string
  emotion?: string
  volume?: 'normal' | 'loud' | 'whisper'
  pace?: 'normal' | 'fast' | 'slow'
  pause?: number
  voiceId?: string
  audioAssetId?: string
  sortOrder?: number
}

/**
 * 场景对话仓库
 */
export class SceneDialogueRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据场景ID获取所有对话
   */
  getBySceneScriptId(sceneScriptId: string): Dialogue[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scene_dialogues WHERE scene_script_id = ? ORDER BY sort_order ASC
    `)
    const rows = stmt.all(sceneScriptId) as SceneDialogueRecord[]
    return rows.map(this.mapToDialogue)
  }

  /**
   * 根据ID获取对话
   */
  getById(id: string): Dialogue | null {
    const stmt = this.db.prepare('SELECT * FROM scene_dialogues WHERE id = ?')
    const row = stmt.get(id) as SceneDialogueRecord | undefined
    return row ? this.mapToDialogue(row) : null
  }

  /**
   * 创建对话
   */
  create(data: CreateSceneDialogueRequest): Dialogue {
    const id = this.generateId()

    const stmt = this.db.prepare(`
      INSERT INTO scene_dialogues (id, scene_script_id, character_id, character_name, text, emotion, volume, pace, pause, voice_id, audio_asset_id, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.sceneScriptId,
      data.characterId,
      data.characterName,
      data.text,
      data.emotion || null,
      data.volume || 'normal',
      data.pace || 'normal',
      data.pause || 0,
      data.voiceId || null,
      data.audioAssetId || null,
      data.sortOrder
    )

    return {
      id,
      characterId: data.characterId,
      characterName: data.characterName,
      text: data.text,
      emotion: data.emotion,
      volume: data.volume || 'normal',
      pace: data.pace || 'normal',
      pause: data.pause || 0,
      voiceId: data.voiceId
    }
  }

  /**
   * 批量创建对话
   */
  createMany(dialogues: CreateSceneDialogueRequest[]): Dialogue[] {
    const results: Dialogue[] = []
    const transaction = this.db.transaction(() => {
      for (const data of dialogues) {
        results.push(this.create(data))
      }
    })
    transaction()
    return results
  }

  /**
   * 更新对话
   */
  update(id: string, data: UpdateSceneDialogueRequest): Dialogue | null {
    const dialogue = this.getById(id)
    if (!dialogue) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.characterId !== undefined) {
      updates.push('character_id = ?')
      values.push(data.characterId)
    }
    if (data.characterName !== undefined) {
      updates.push('character_name = ?')
      values.push(data.characterName)
    }
    if (data.text !== undefined) {
      updates.push('text = ?')
      values.push(data.text)
    }
    if (data.emotion !== undefined) {
      updates.push('emotion = ?')
      values.push(data.emotion || null)
    }
    if (data.volume !== undefined) {
      updates.push('volume = ?')
      values.push(data.volume)
    }
    if (data.pace !== undefined) {
      updates.push('pace = ?')
      values.push(data.pace)
    }
    if (data.pause !== undefined) {
      updates.push('pause = ?')
      values.push(data.pause)
    }
    if (data.voiceId !== undefined) {
      updates.push('voice_id = ?')
      values.push(data.voiceId || null)
    }
    if (data.audioAssetId !== undefined) {
      updates.push('audio_asset_id = ?')
      values.push(data.audioAssetId || null)
    }
    if (data.sortOrder !== undefined) {
      updates.push('sort_order = ?')
      values.push(data.sortOrder)
    }

    if (updates.length === 0) return dialogue

    values.push(id)
    const stmt = this.db.prepare(`UPDATE scene_dialogues SET ${updates.join(', ')} WHERE id = ?`)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除对话
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM scene_dialogues WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 根据场景ID删除所有对话
   */
  deleteBySceneScriptId(sceneScriptId: string): number {
    const stmt = this.db.prepare('DELETE FROM scene_dialogues WHERE scene_script_id = ?')
    const result = stmt.run(sceneScriptId)
    return result.changes
  }

  /**
   * 获取对话数量
   */
  countBySceneScriptId(sceneScriptId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM scene_dialogues WHERE scene_script_id = ?')
    const row = stmt.get(sceneScriptId) as { count: number }
    return row.count
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `dlg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到对话对象
   */
  private mapToDialogue(row: SceneDialogueRecord): Dialogue {
    return {
      id: row.id,
      characterId: row.character_id,
      characterName: row.character_name,
      text: row.text,
      emotion: row.emotion || undefined,
      volume: (row.volume as 'normal' | 'loud' | 'whisper') || 'normal',
      pace: (row.pace as 'normal' | 'fast' | 'slow') || 'normal',
      pause: row.pause || 0,
      voiceId: row.voice_id || undefined
    }
  }
}