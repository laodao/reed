/**
 * 场景动作仓库
 * @module database/repositories/scene-action.repository
 */

import Database from 'better-sqlite3'
import {
  ActionDescription,
  SceneActionRecord
} from '@shared/types/story-to-video.types'

/**
 * 创建场景动作请求
 */
export interface CreateSceneActionRequest {
  sceneScriptId: string
  characterId?: string
  description: string
  timing?: 'before' | 'during' | 'after'
  duration?: number
  sortOrder: number
}

/**
 * 更新场景动作请求
 */
export interface UpdateSceneActionRequest {
  characterId?: string
  description?: string
  timing?: 'before' | 'during' | 'after'
  duration?: number
  sortOrder?: number
}

/**
 * 场景动作仓库
 */
export class SceneActionRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据场景ID获取所有动作
   */
  getBySceneScriptId(sceneScriptId: string): ActionDescription[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scene_actions WHERE scene_script_id = ? ORDER BY sort_order ASC
    `)
    const rows = stmt.all(sceneScriptId) as SceneActionRecord[]
    return rows.map(this.mapToAction)
  }

  /**
   * 根据ID获取动作
   */
  getById(id: string): ActionDescription | null {
    const stmt = this.db.prepare('SELECT * FROM scene_actions WHERE id = ?')
    const row = stmt.get(id) as SceneActionRecord | undefined
    return row ? this.mapToAction(row) : null
  }

  /**
   * 创建动作
   */
  create(data: CreateSceneActionRequest): ActionDescription {
    const id = this.generateId()

    const stmt = this.db.prepare(`
      INSERT INTO scene_actions (id, scene_script_id, character_id, description, timing, duration, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.sceneScriptId,
      data.characterId || null,
      data.description,
      data.timing || 'during',
      data.duration || null,
      data.sortOrder
    )

    return {
      id,
      characterId: data.characterId,
      description: data.description,
      timing: data.timing || 'during',
      duration: data.duration
    }
  }

  /**
   * 批量创建动作
   */
  createMany(actions: CreateSceneActionRequest[]): ActionDescription[] {
    const results: ActionDescription[] = []
    const transaction = this.db.transaction(() => {
      for (const data of actions) {
        results.push(this.create(data))
      }
    })
    transaction()
    return results
  }

  /**
   * 更新动作
   */
  update(id: string, data: UpdateSceneActionRequest): ActionDescription | null {
    const action = this.getById(id)
    if (!action) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.characterId !== undefined) {
      updates.push('character_id = ?')
      values.push(data.characterId || null)
    }
    if (data.description !== undefined) {
      updates.push('description = ?')
      values.push(data.description)
    }
    if (data.timing !== undefined) {
      updates.push('timing = ?')
      values.push(data.timing)
    }
    if (data.duration !== undefined) {
      updates.push('duration = ?')
      values.push(data.duration || null)
    }
    if (data.sortOrder !== undefined) {
      updates.push('sort_order = ?')
      values.push(data.sortOrder)
    }

    if (updates.length === 0) return action

    values.push(id)
    const stmt = this.db.prepare(`UPDATE scene_actions SET ${updates.join(', ')} WHERE id = ?`)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除动作
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM scene_actions WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 根据场景ID删除所有动作
   */
  deleteBySceneScriptId(sceneScriptId: string): number {
    const stmt = this.db.prepare('DELETE FROM scene_actions WHERE scene_script_id = ?')
    const result = stmt.run(sceneScriptId)
    return result.changes
  }

  /**
   * 获取动作数量
   */
  countBySceneScriptId(sceneScriptId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM scene_actions WHERE scene_script_id = ?')
    const row = stmt.get(sceneScriptId) as { count: number }
    return row.count
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到动作对象
   */
  private mapToAction(row: SceneActionRecord): ActionDescription {
    return {
      id: row.id,
      characterId: row.character_id || undefined,
      description: row.description,
      timing: row.timing as 'before' | 'during' | 'after',
      duration: row.duration || undefined
    }
  }
}