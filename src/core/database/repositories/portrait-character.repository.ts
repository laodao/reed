/**
 * 人像角色数据访问层
 * @module database/repositories/portrait-character.repository
 * @description 提供人像角色的数据库操作
 */

import Database from 'better-sqlite3'
import type {
  PortraitCharacter,
  CreatePortraitCharacterRequest,
  UpdatePortraitCharacterRequest,
  PortraitGender,
  PortraitRace
} from '@shared/types/portrait.types'
import { randomUUID } from 'crypto'

/**
 * 人像角色数据仓库
 */
export class PortraitCharacterRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为 PortraitCharacter 对象
   */
  private rowToCharacter(row: any): PortraitCharacter {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      gender: row.gender as PortraitGender,
      age: row.age,
      height: row.height,
      weight: row.weight,
      race: row.race as PortraitRace,
      description: row.description || undefined,
      prompt: row.prompt || undefined,
      referenceImages: row.reference_images ? JSON.parse(row.reference_images) : [],
      providerId: row.provider_id || undefined,
      modelId: row.model_id || undefined,
      config: row.config ? JSON.parse(row.config) : { angles: ['front'], backgroundType: 'solid' },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  /**
   * 获取项目的所有角色
   */
  async getByProjectId(projectId: string): Promise<PortraitCharacter[]> {
    const rows = this.db.prepare(
      `SELECT * FROM portrait_characters WHERE project_id = ? ORDER BY created_at DESC`
    ).all(projectId) as any[]

    return rows.map(row => this.rowToCharacter(row))
  }

  /**
   * 根据ID获取角色
   */
  async getById(id: string): Promise<PortraitCharacter | null> {
    const row = this.db.prepare('SELECT * FROM portrait_characters WHERE id = ?').get(id) as any
    if (!row) return null
    return this.rowToCharacter(row)
  }

  /**
   * 创建角色
   */
  async create(request: CreatePortraitCharacterRequest): Promise<PortraitCharacter> {
    const id = randomUUID()
    const now = Date.now()
    const defaultConfig = {
      angles: ['front'] as const,
      backgroundType: 'solid' as const,
      ...request.config
    }

    // 如果没有提供 prompt，则为空（生成时再设置）
    const prompt = request.prompt || null

    this.db.prepare(
      `INSERT INTO portrait_characters
       (id, project_id, name, gender, age, height, weight, race, description, prompt,
        reference_images, provider_id, model_id, config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      request.projectId,
      request.name,
      request.gender,
      request.age,
      request.height,
      request.weight,
      request.race,
      request.description || null,
      prompt,
      JSON.stringify(request.referenceImages || []),
      request.providerId || null,
      request.modelId || null,
      JSON.stringify(defaultConfig),
      now,
      now
    )

    return {
      id,
      projectId: request.projectId,
      name: request.name,
      gender: request.gender,
      age: request.age,
      height: request.height,
      weight: request.weight,
      race: request.race,
      description: request.description,
      prompt: prompt || undefined,
      referenceImages: request.referenceImages || [],
      providerId: request.providerId,
      modelId: request.modelId,
      config: defaultConfig,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 根据基本信息生成提示词
   */
  private generatePromptFromInfo(request: CreatePortraitCharacterRequest): string {
    const genderText = request.gender === 'male' ? 'male' : 'female'
    const raceText = request.race === 'asian' ? 'Asian' : 'European'

    // 构建基本描述
    let prompt = `${raceText} ${genderText}, ${request.age} years old`

    // 添加身高体重信息
    prompt += `, ${request.height}cm tall, ${request.weight}kg`

    // 添加人物简介
    if (request.description) {
      prompt += `, ${request.description}`
    }

    // 添加全身照要求
    prompt += ', full body shot, standing pose, professional portrait photography, high quality, single person, solo portrait, one person only'

    return prompt
  }

  /**
   * 更新角色
   */
  async update(request: UpdatePortraitCharacterRequest): Promise<PortraitCharacter | null> {
    const character = await this.getById(request.id)
    if (!character) return null

    const fields: string[] = ['updated_at = ?']
    const values: any[] = [Date.now()]

    if (request.name !== undefined) {
      fields.push('name = ?')
      values.push(request.name)
    }
    if (request.gender !== undefined) {
      fields.push('gender = ?')
      values.push(request.gender)
    }
    if (request.age !== undefined) {
      fields.push('age = ?')
      values.push(request.age)
    }
    if (request.height !== undefined) {
      fields.push('height = ?')
      values.push(request.height)
    }
    if (request.weight !== undefined) {
      fields.push('weight = ?')
      values.push(request.weight)
    }
    if (request.race !== undefined) {
      fields.push('race = ?')
      values.push(request.race)
    }
    if (request.description !== undefined) {
      fields.push('description = ?')
      values.push(request.description || null)
    }
    if (request.prompt !== undefined) {
      fields.push('prompt = ?')
      values.push(request.prompt)
    }
    if (request.referenceImages !== undefined) {
      fields.push('reference_images = ?')
      values.push(JSON.stringify(request.referenceImages))
    }
    if (request.providerId !== undefined) {
      fields.push('provider_id = ?')
      values.push(request.providerId)
    }
    if (request.modelId !== undefined) {
      fields.push('model_id = ?')
      values.push(request.modelId)
    }
    if (request.config !== undefined) {
      fields.push('config = ?')
      values.push(JSON.stringify({ ...character.config, ...request.config }))
    }

    values.push(request.id)
    this.db.prepare(`UPDATE portrait_characters SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    return this.getById(request.id)
  }

  /**
   * 删除角色
   */
  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM portrait_characters WHERE id = ?').run(id)
  }

  /**
   * 删除项目的所有角色
   */
  async deleteByProjectId(projectId: string): Promise<void> {
    this.db.prepare('DELETE FROM portrait_characters WHERE project_id = ?').run(projectId)
  }

  /**
   * 统计项目的角色数量
   */
  async countByProjectId(projectId: string): Promise<number> {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM portrait_characters WHERE project_id = ?'
    ).get(projectId) as { count: number }
    return row?.count || 0
  }
}