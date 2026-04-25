/**
 * 场景剧本仓库
 * @module database/repositories/scene-script.repository
 */

import Database from 'better-sqlite3'
import {
  SceneScript,
  SceneScriptRecord,
  SceneCharacter,
  Dialogue,
  ActionDescription,
  LocationType,
  TimeOfDay,
  WeatherType
} from '@shared/types/story-to-video.types'

/**
 * 创建场景剧本请求
 */
export interface CreateSceneScriptRequest {
  episodeScriptId: string
  sceneNumber: number
  location: string
  locationType: LocationType
  timeOfDay: TimeOfDay
  weather?: WeatherType
  sceneDescription: string
  mood: string
  lighting?: string
  characters: SceneCharacter[]
  originalText: string
  narration: string
  dialogues: Dialogue[]
  actions: ActionDescription[]
}

/**
 * 更新场景剧本请求
 */
export interface UpdateSceneScriptRequest {
  location?: string
  locationType?: LocationType
  timeOfDay?: TimeOfDay
  weather?: WeatherType
  sceneDescription?: string
  mood?: string
  lighting?: string
  characters?: SceneCharacter[]
  originalText?: string
  narration?: string
  dialogues?: Dialogue[]
  actions?: ActionDescription[]
}

/**
 * 场景剧本仓库
 */
export class SceneScriptRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据剧本 ID 获取所有场景
   */
  getByEpisodeScriptId(episodeScriptId: string): SceneScript[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scene_scripts WHERE episode_script_id = ? ORDER BY scene_number ASC
    `)
    const rows = stmt.all(episodeScriptId) as SceneScriptRecord[]
    return rows.map(this.mapToSceneScript)
  }

  /**
   * 根据 ID 获取场景剧本
   */
  getById(id: string): SceneScript | null {
    const stmt = this.db.prepare(`
      SELECT * FROM scene_scripts WHERE id = ?
    `)
    const row = stmt.get(id) as SceneScriptRecord | undefined
    return row ? this.mapToSceneScript(row) : null
  }

  /**
   * 创建场景剧本
   */
  create(data: CreateSceneScriptRequest): SceneScript {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO scene_scripts (id, episode_script_id, scene_number, location, location_type, time_of_day, weather, scene_description, mood, lighting, characters, original_text, narration, dialogues, actions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.episodeScriptId,
      data.sceneNumber,
      data.location,
      data.locationType,
      data.timeOfDay,
      data.weather || null,
      data.sceneDescription,
      data.mood,
      data.lighting || null,
      JSON.stringify(data.characters),
      data.originalText,
      data.narration,
      JSON.stringify(data.dialogues),
      JSON.stringify(data.actions),
      now,
      now
    )

    return {
      id,
      episodeScriptId: data.episodeScriptId,
      sceneNumber: data.sceneNumber,
      location: data.location,
      locationType: data.locationType,
      timeOfDay: data.timeOfDay,
      weather: data.weather,
      sceneDescription: data.sceneDescription,
      mood: data.mood,
      lighting: data.lighting,
      characters: data.characters,
      originalText: data.originalText,
      narration: data.narration,
      dialogues: data.dialogues,
      actions: data.actions,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 批量创建场景剧本
   */
  createMany(scenes: CreateSceneScriptRequest[]): SceneScript[] {
    const results: SceneScript[] = []
    const transaction = this.db.transaction(() => {
      for (const data of scenes) {
        results.push(this.create(data))
      }
    })
    transaction()
    return results
  }

  /**
   * 更新场景剧本
   */
  update(id: string, data: UpdateSceneScriptRequest): SceneScript | null {
    const scene = this.getById(id)
    if (!scene) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.location !== undefined) {
      updates.push('location = ?')
      values.push(data.location)
    }
    if (data.locationType !== undefined) {
      updates.push('location_type = ?')
      values.push(data.locationType)
    }
    if (data.timeOfDay !== undefined) {
      updates.push('time_of_day = ?')
      values.push(data.timeOfDay)
    }
    if (data.weather !== undefined) {
      updates.push('weather = ?')
      values.push(data.weather || null)
    }
    if (data.sceneDescription !== undefined) {
      updates.push('scene_description = ?')
      values.push(data.sceneDescription)
    }
    if (data.mood !== undefined) {
      updates.push('mood = ?')
      values.push(data.mood)
    }
    if (data.lighting !== undefined) {
      updates.push('lighting = ?')
      values.push(data.lighting || null)
    }
    if (data.characters !== undefined) {
      updates.push('characters = ?')
      values.push(JSON.stringify(data.characters))
    }
    if (data.originalText !== undefined) {
      updates.push('original_text = ?')
      values.push(data.originalText)
    }
    if (data.narration !== undefined) {
      updates.push('narration = ?')
      values.push(data.narration)
    }
    if (data.dialogues !== undefined) {
      updates.push('dialogues = ?')
      values.push(JSON.stringify(data.dialogues))
    }
    if (data.actions !== undefined) {
      updates.push('actions = ?')
      values.push(JSON.stringify(data.actions))
    }

    if (updates.length === 0) return scene

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE scene_scripts SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除场景剧本
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM scene_scripts WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 根据剧本 ID 删除所有场景
   */
  deleteByEpisodeScriptId(episodeScriptId: string): number {
    const stmt = this.db.prepare('DELETE FROM scene_scripts WHERE episode_script_id = ?')
    const result = stmt.run(episodeScriptId)
    return result.changes
  }

  /**
   * 获取场景数量
   */
  countByEpisodeScriptId(episodeScriptId: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM scene_scripts WHERE episode_script_id = ?
    `)
    const row = stmt.get(episodeScriptId) as { count: number }
    return row.count
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `ss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到场景剧本对象
   */
  private mapToSceneScript(row: SceneScriptRecord): SceneScript {
    return {
      id: row.id,
      episodeScriptId: row.episode_script_id,
      sceneNumber: row.scene_number,
      location: row.location,
      locationType: row.location_type as LocationType,
      timeOfDay: row.time_of_day as TimeOfDay,
      weather: row.weather as WeatherType | undefined,
      sceneDescription: row.scene_description,
      mood: row.mood,
      lighting: row.lighting || undefined,
      characters: JSON.parse(row.characters) as SceneCharacter[],
      originalText: row.original_text,
      narration: row.narration,
      dialogues: JSON.parse(row.dialogues) as Dialogue[],
      actions: JSON.parse(row.actions) as ActionDescription[],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}