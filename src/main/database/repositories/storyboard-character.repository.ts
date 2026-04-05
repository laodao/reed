/**
 * 分镜角色仓库
 * @module database/repositories/storyboard-character.repository
 */

import Database from 'better-sqlite3'
import {
  StoryboardCharacter,
  StoryboardCharacterRecord
} from '../../../shared/types/story-to-video.types'

/**
 * 创建分镜角色请求
 */
export interface CreateStoryboardCharacterRequest {
  storyboardId: string
  characterId: string
  positionX?: number
  positionY?: number
  positionScale?: number
  expression?: string
  action?: string
  facing?: 'front' | 'left' | 'right' | 'back' | 'three_quarter_left' | 'three_quarter_right'
  sortOrder: number
}

/**
 * 更新分镜角色请求
 */
export interface UpdateStoryboardCharacterRequest {
  characterId?: string
  positionX?: number
  positionY?: number
  positionScale?: number
  expression?: string
  action?: string
  facing?: 'front' | 'left' | 'right' | 'back' | 'three_quarter_left' | 'three_quarter_right'
  sortOrder?: number
}

/**
 * 分镜角色仓库
 */
export class StoryboardCharacterRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据分镜ID获取所有角色
   */
  getByStoryboardId(storyboardId: string): StoryboardCharacter[] {
    const stmt = this.db.prepare(`
      SELECT * FROM storyboard_characters WHERE storyboard_id = ? ORDER BY sort_order ASC
    `)
    const rows = stmt.all(storyboardId) as StoryboardCharacterRecord[]
    return rows.map(this.mapToStoryboardCharacter)
  }

  /**
   * 根据ID获取角色
   */
  getById(id: string): StoryboardCharacter | null {
    const stmt = this.db.prepare('SELECT * FROM storyboard_characters WHERE id = ?')
    const row = stmt.get(id) as StoryboardCharacterRecord | undefined
    return row ? this.mapToStoryboardCharacter(row) : null
  }

  /**
   * 创建角色
   */
  create(data: CreateStoryboardCharacterRequest): StoryboardCharacter {
    const id = this.generateId()

    const stmt = this.db.prepare(`
      INSERT INTO storyboard_characters (id, storyboard_id, character_id, position_x, position_y, position_scale, expression, action, facing, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.storyboardId,
      data.characterId,
      data.positionX ?? 50,
      data.positionY ?? 50,
      data.positionScale ?? 1.0,
      data.expression || null,
      data.action || null,
      data.facing || 'front',
      data.sortOrder
    )

    return {
      characterId: data.characterId,
      position: {
        x: data.positionX ?? 50,
        y: data.positionY ?? 50,
        scale: data.positionScale ?? 1.0
      },
      expression: data.expression,
      action: data.action,
      facing: data.facing as 'front' | 'left' | 'right' | 'back' | 'three_quarter_left' | 'three_quarter_right'
    }
  }

  /**
   * 批量创建角色
   */
  createMany(characters: CreateStoryboardCharacterRequest[]): StoryboardCharacter[] {
    const results: StoryboardCharacter[] = []
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
  update(id: string, data: UpdateStoryboardCharacterRequest): StoryboardCharacter | null {
    const character = this.getById(id)
    if (!character) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.characterId !== undefined) {
      updates.push('character_id = ?')
      values.push(data.characterId)
    }
    if (data.positionX !== undefined) {
      updates.push('position_x = ?')
      values.push(data.positionX)
    }
    if (data.positionY !== undefined) {
      updates.push('position_y = ?')
      values.push(data.positionY)
    }
    if (data.positionScale !== undefined) {
      updates.push('position_scale = ?')
      values.push(data.positionScale)
    }
    if (data.expression !== undefined) {
      updates.push('expression = ?')
      values.push(data.expression || null)
    }
    if (data.action !== undefined) {
      updates.push('action = ?')
      values.push(data.action || null)
    }
    if (data.facing !== undefined) {
      updates.push('facing = ?')
      values.push(data.facing)
    }
    if (data.sortOrder !== undefined) {
      updates.push('sort_order = ?')
      values.push(data.sortOrder)
    }

    if (updates.length === 0) return character

    values.push(id)
    const stmt = this.db.prepare(`UPDATE storyboard_characters SET ${updates.join(', ')} WHERE id = ?`)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除角色
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM storyboard_characters WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 根据分镜ID删除所有角色
   */
  deleteByStoryboardId(storyboardId: string): number {
    const stmt = this.db.prepare('DELETE FROM storyboard_characters WHERE storyboard_id = ?')
    const result = stmt.run(storyboardId)
    return result.changes
  }

  /**
   * 获取角色数量
   */
  countByStoryboardId(storyboardId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM storyboard_characters WHERE storyboard_id = ?')
    const row = stmt.get(storyboardId) as { count: number }
    return row.count
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `stc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到分镜角色对象
   */
  private mapToStoryboardCharacter(row: StoryboardCharacterRecord): StoryboardCharacter {
    return {
      characterId: row.character_id,
      position: {
        x: row.position_x,
        y: row.position_y,
        scale: row.position_scale
      },
      expression: row.expression || undefined,
      action: row.action || undefined,
      facing: row.facing as 'front' | 'left' | 'right' | 'back' | 'three_quarter_left' | 'three_quarter_right'
    }
  }
}