/**
 * 长文写作角色仓库
 * @module database/repositories/lw-character.repository
 */

import Database from 'better-sqlite3'
import {
  StoryCharacter,
  CreateCharacterRequest,
  UpdateCharacterRequest,
  CharacterRelation,
  EntityImportance,
  TemporaryCharacterTemplateType,
  StoryCharacterRace
} from '../../../shared/types/longwriting.types'

export class LwCharacterRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据项目 ID 获取所有角色
   */
  getByProjectId(projectId: string): StoryCharacter[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_characters WHERE project_id = ? ORDER BY created_at ASC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(this.mapToCharacter)
  }

  /**
   * 根据项目 ID 获取所有临时角色
   */
  getTemporaryByProjectId(projectId: string): StoryCharacter[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_characters WHERE project_id = ? AND importance = 'temporary' ORDER BY created_at ASC
    `)
    const rows = stmt.all(projectId) as any[]
    return rows.map(this.mapToCharacter)
  }

  /**
   * 根据 ID 获取角色
   */
  getById(id: string): StoryCharacter | null {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_characters WHERE id = ?
    `)
    const row = stmt.get(id) as any
    return row ? this.mapToCharacter(row) : null
  }

  /**
   * 根据人像ID获取关联的角色
   */
  getByPortraitId(portraitId: string): StoryCharacter[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_story_characters WHERE portrait_id = ?
    `)
    const rows = stmt.all(portraitId) as any[]
    return rows.map(this.mapToCharacter)
  }

  /**
   * 创建角色
   */
  create(data: CreateCharacterRequest): StoryCharacter {
    const id = this.generateId()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO lw_story_characters (
        id, project_id, portrait_id, name, gender, age, height, weight, race,
        occupation, position, appearance, background, personality, abilities,
        role_position, major_events, created_at, updated_at, importance,
        template_type, generated_image_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // 确保所有参数都是原始类型，数组需要转换为字符串
    const normalizeValue = (value: any): string => {
      if (value === null || value === undefined) return ''
      if (Array.isArray(value)) return value.join('、')
      if (typeof value === 'object') return JSON.stringify(value)
      return String(value)
    }

    stmt.run(
      id,
      data.projectId,
      data.portraitId || null,
      normalizeValue(data.name),
      data.gender || 'male',
      data.age || 25,
      data.height || null,
      data.weight || null,
      data.race || null,
      data.occupation || null,
      data.position || null,
      normalizeValue(data.appearance),
      normalizeValue(data.background),
      normalizeValue(data.personality),
      normalizeValue(data.abilities),
      data.rolePosition || 'supporting',
      normalizeValue(data.majorEvents),
      now,
      now,
      data.importance || 'secondary',
      data.templateType || null,
      data.generatedImageId || null
    )

    return {
      id,
      projectId: data.projectId,
      portraitId: data.portraitId,
      name: data.name,
      gender: data.gender || 'male',
      age: data.age || 25,
      height: data.height,
      weight: data.weight,
      race: data.race,
      occupation: data.occupation,
      position: data.position,
      appearance: data.appearance || '',
      background: data.background || '',
      personality: data.personality || '',
      abilities: data.abilities || '',
      rolePosition: data.rolePosition || 'supporting',
      importance: data.importance || 'secondary' as EntityImportance,
      templateType: data.templateType,
      generatedImageId: data.generatedImageId,
      majorEvents: data.majorEvents || '',
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新角色
   */
  update(id: string, data: UpdateCharacterRequest): StoryCharacter | null {
    const character = this.getById(id)
    if (!character) return null

    const updates: string[] = []
    const values: any[] = []

    const fieldMap: Record<string, any> = {
      portrait_id: data.portraitId,
      name: data.name,
      gender: data.gender,
      age: data.age,
      height: data.height,
      weight: data.weight,
      race: data.race,
      occupation: data.occupation,
      position: data.position,
      appearance: data.appearance,
      background: data.background,
      personality: data.personality,
      abilities: data.abilities,
      role_position: data.rolePosition,
      importance: data.importance,
      template_type: data.templateType,
      generated_image_id: data.generatedImageId,
      major_events: data.majorEvents
    }

    for (const [field, value] of Object.entries(fieldMap)) {
      if (value !== undefined) {
        updates.push(`${field} = ?`)
        values.push(value)
      }
    }

    if (updates.length === 0) return character

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE lw_story_characters SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.getById(id)
  }

  /**
   * 删除角色
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_story_characters WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 获取角色的所有关系
   */
  getRelations(characterId: string): CharacterRelation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_character_relations WHERE character_id = ?
    `)
    const rows = stmt.all(characterId) as any[]
    return rows.map(this.mapToRelation)
  }

  /**
   * 添加角色关系
   */
  addRelation(
    characterId: string,
    relatedCharacterId: string,
    relationType: string,
    relationDescription: string
  ): CharacterRelation {
    const id = this.generateRelationId()

    const stmt = this.db.prepare(`
      INSERT INTO lw_character_relations (
        id, character_id, related_character_id, relation_type, relation_description, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, characterId, relatedCharacterId, relationType, relationDescription, Date.now())

    return {
      id,
      characterId,
      relatedCharacterId,
      relationType,
      relationDescription,
      createdAt: Date.now()
    }
  }

  /**
   * 删除角色关系
   */
  deleteRelation(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_character_relations WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  private generateId(): string {
    return `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateRelationId(): string {
    return `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private mapToCharacter(row: any): StoryCharacter {
    return {
      id: row.id,
      projectId: row.project_id,
      portraitId: row.portrait_id,
      name: row.name,
      gender: row.gender,
      age: row.age,
      height: row.height,
      weight: row.weight,
      race: row.race,
      occupation: row.occupation,
      position: row.position,
      appearance: row.appearance || '',
      background: row.background || '',
      personality: row.personality || '',
      abilities: row.abilities || '',
      rolePosition: row.role_position,
      importance: row.importance || 'secondary' as EntityImportance,
      templateType: row.template_type as TemporaryCharacterTemplateType | undefined,
      generatedImageId: row.generated_image_id,
      majorEvents: row.major_events || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private mapToRelation(row: any): CharacterRelation {
    return {
      id: row.id,
      characterId: row.character_id,
      relatedCharacterId: row.related_character_id,
      relationType: row.relation_type,
      relationDescription: row.relation_description,
      createdAt: row.created_at
    }
  }
}