/**
 * 场景角色仓库
 * @module database/repositories/scene-character.repository
 */

import Database from 'better-sqlite3'
import {
  SceneCharacter,
  SceneCharacterRecord
} from '@shared/types/story-to-video.types'

/**
 * 创建场景角色请求
 */
export interface CreateSceneCharacterRequest {
  sceneScriptId: string
  characterId: string
  characterName: string
  position?: 'left' | 'center' | 'right' | 'foreground' | 'background'
  expression?: string
  action?: string
  outfit?: string
  props?: string[]
  sortOrder: number
}

/**
 * 更新场景角色请求
 */
export interface UpdateSceneCharacterRequest {
  characterId?: string
  characterName?: string
  position?: 'left' | 'center' | 'right' | 'foreground' | 'background'
  expression?: string
  action?: string
  outfit?: string
  props?: string[]
  sortOrder?: number
}

/**
 * 场景角色仓库
 */
export class SceneCharacterRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据场景ID获取所有角色
   */
  getBySceneScriptId(sceneScriptId: string): SceneCharacter[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scene_characters WHERE scene_script_id = ? ORDER BY sort_order ASC
    `)
    const rows = stmt.all(sceneScriptId) as SceneCharacterRecord[]
    return rows.map(row => this.mapToSceneCharacter(row, this.getPropsByCharacterId(row.id)))
  }

  /**
   * 根据ID获取角色
   */
  getById(id: string): SceneCharacter | null {
    const stmt = this.db.prepare('SELECT * FROM scene_characters WHERE id = ?')
    const row = stmt.get(id) as SceneCharacterRecord | undefined
    if (!row) return null
    return this.mapToSceneCharacter(row, this.getPropsByCharacterId(row.id))
  }

  /**
   * 获取角色的道具
   */
  private getPropsByCharacterId(characterId: string): string[] {
    const stmt = this.db.prepare('SELECT prop_name FROM scene_props WHERE scene_character_id = ?')
    const rows = stmt.all(characterId) as { prop_name: string }[]
    return rows.map(r => r.prop_name)
  }

  /**
   * 创建角色
   */
  create(data: CreateSceneCharacterRequest): SceneCharacter {
    const id = this.generateId()

    const stmt = this.db.prepare(`
      INSERT INTO scene_characters (id, scene_script_id, character_id, character_name, position, expression, action, outfit, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.sceneScriptId,
      data.characterId,
      data.characterName,
      data.position || 'center',
      data.expression || null,
      data.action || null,
      data.outfit || null,
      data.sortOrder
    )

    // 插入道具
    if (data.props && data.props.length > 0) {
      const propStmt = this.db.prepare(`
        INSERT INTO scene_props (id, scene_character_id, prop_name)
        VALUES (?, ?, ?)
      `)
      for (const prop of data.props) {
        propStmt.run(`sp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, id, prop)
      }
    }

    return {
      characterId: data.characterId,
      characterName: data.characterName,
      position: data.position,
      expression: data.expression,
      action: data.action,
      outfit: data.outfit,
      props: data.props || []
    }
  }

  /**
   * 批量创建角色
   */
  createMany(characters: CreateSceneCharacterRequest[]): SceneCharacter[] {
    const results: SceneCharacter[] = []
    const transaction = this.db.transaction(() => {
      for (const data of characters) {
        results.push(this.create(data))
      }
    })
    transaction()
    return results
  }

  /**
   * 更新角色
   */
  update(id: string, data: UpdateSceneCharacterRequest): SceneCharacter | null {
    const character = this.getById(id)
    if (!character) return null

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
    if (data.position !== undefined) {
      updates.push('position = ?')
      values.push(data.position)
    }
    if (data.expression !== undefined) {
      updates.push('expression = ?')
      values.push(data.expression || null)
    }
    if (data.action !== undefined) {
      updates.push('action = ?')
      values.push(data.action || null)
    }
    if (data.outfit !== undefined) {
      updates.push('outfit = ?')
      values.push(data.outfit || null)
    }
    if (data.sortOrder !== undefined) {
      updates.push('sort_order = ?')
      values.push(data.sortOrder)
    }

    if (updates.length > 0) {
      values.push(id)
      const stmt = this.db.prepare(`UPDATE scene_characters SET ${updates.join(', ')} WHERE id = ?`)
      stmt.run(...values)
    }

    // 更新道具
    if (data.props !== undefined) {
      // 删除旧道具
      this.db.prepare('DELETE FROM scene_props WHERE scene_character_id = ?').run(id)

      // 插入新道具
      if (data.props.length > 0) {
        const propStmt = this.db.prepare(`
          INSERT INTO scene_props (id, scene_character_id, prop_name)
          VALUES (?, ?, ?)
        `)
        for (const prop of data.props) {
          propStmt.run(`sp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, id, prop)
        }
      }
    }

    return this.getById(id)
  }

  /**
   * 删除角色
   */
  delete(id: string): boolean {
    // 先删除道具
    this.db.prepare('DELETE FROM scene_props WHERE scene_character_id = ?').run(id)

    const stmt = this.db.prepare('DELETE FROM scene_characters WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 根据场景ID删除所有角色
   */
  deleteBySceneScriptId(sceneScriptId: string): number {
    // 获取所有角色ID
    const stmt = this.db.prepare('SELECT id FROM scene_characters WHERE scene_script_id = ?')
    const rows = stmt.all(sceneScriptId) as { id: string }[]

    // 删除所有道具
    for (const row of rows) {
      this.db.prepare('DELETE FROM scene_props WHERE scene_character_id = ?').run(row.id)
    }

    // 删除角色
    const deleteStmt = this.db.prepare('DELETE FROM scene_characters WHERE scene_script_id = ?')
    const result = deleteStmt.run(sceneScriptId)
    return result.changes
  }

  /**
   * 获取角色数量
   */
  countBySceneScriptId(sceneScriptId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM scene_characters WHERE scene_script_id = ?')
    const row = stmt.get(sceneScriptId) as { count: number }
    return row.count
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `sc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到场景角色对象
   */
  private mapToSceneCharacter(row: SceneCharacterRecord, props: string[]): SceneCharacter {
    return {
      characterId: row.character_id,
      characterName: row.character_name,
      position: row.position as 'left' | 'center' | 'right' | 'foreground' | 'background' | undefined,
      expression: row.expression || undefined,
      action: row.action || undefined,
      outfit: row.outfit || undefined,
      props: props.length > 0 ? props : undefined
    }
  }
}