/**
 * 技能仓库
 * @module database/repositories/lw-skill.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, type DataSource } from 'typeorm'
import { StorySkill, SkillType, SkillLevel } from '@shared/types/longwriting.types'
import { LwSkillEntity } from '../entities/lw-skill.entity'
import { LwSkillCharacterRepository } from './lw-skill-character.repository'
import { BaseRepository } from '../base-repository'

export class LwSkillRepository extends BaseRepository<LwSkillEntity, StorySkill> {
  private skillCharacterRepo: LwSkillCharacterRepository

  constructor(dataSource: DataSource) {
    super(dataSource, LwSkillEntity)
    this.skillCharacterRepo = new LwSkillCharacterRepository(dataSource)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: LwSkillEntity): StorySkill {
    return {
      id: e.id,
      projectId: e.projectId,
      name: e.name,
      type: (e.type as SkillType) || ('' as SkillType),
      level: (e.level as SkillLevel) || ('' as SkillLevel),
      description: e.description ?? '',
      system: e.system ?? '',
      characterIds: ((e.characterIds as string[] | null) ?? []) as string[],
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async getByProjectId(projectId: string): Promise<StorySkill[]> {
    return this.findManyByWhere({ projectId } as any, { createdAt: 'DESC' })
  }

  async getById(id: string): Promise<StorySkill | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(data: {
    projectId: string
    name: string
    type: SkillType
    level: SkillLevel
    description: string
    system: string
    characterIds: string[]
  }): Promise<StorySkill> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      name: data.name,
      type: data.type,
      level: data.level,
      description: data.description,
      system: data.system,
      characterIds: data.characterIds,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    if (data.characterIds && data.characterIds.length > 0) {
      await this.skillCharacterRepo.batchAdd(id, data.characterIds)
    }
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: Partial<StorySkill>,
  ): Promise<StorySkill | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.name !== undefined) { existing.name = data.name; changed = true }
    if (data.type !== undefined) { existing.type = data.type; changed = true }
    if (data.level !== undefined) { existing.level = data.level; changed = true }
    if (data.description !== undefined) { existing.description = data.description; changed = true }
    if (data.system !== undefined) { existing.system = data.system; changed = true }
    if (data.characterIds !== undefined) {
      existing.characterIds = data.characterIds
      changed = true
    }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)

    if (data.characterIds !== undefined) {
      await this.skillCharacterRepo.replaceAll(id, data.characterIds)
    }

    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    await this.skillCharacterRepo.deleteBySkillId(id)
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    const skills = await this.scoped.find({
      where: { projectId } as any,
      select: ['id'],
    })
    for (const skill of skills) {
      await this.skillCharacterRepo.deleteBySkillId(skill.id)
    }
    return this.scoped.delete({ projectId } as any)
  }

  async getCharacterIds(skillId: string): Promise<string[]> {
    return this.skillCharacterRepo.getCharacterIdsBySkillId(skillId)
  }

  async updateCharacterRelations(
    skillId: string,
    characterIds: string[],
  ): Promise<void> {
    await this.skillCharacterRepo.replaceAll(skillId, characterIds)
  }

  async getSkillsByCharacterId(characterId: string): Promise<StorySkill[]> {
    const skillIds = await this.skillCharacterRepo.getSkillIdsByCharacterId(
      characterId,
    )
    if (skillIds.length === 0) return []
    const entities = await this.scoped.find({
      where: { id: In(skillIds) } as any,
    })
    return this.toDtoList(entities)
  }

  async getCharacterIdsBySkillIds(
    skillIds: string[],
  ): Promise<Map<string, string[]>> {
    return this.skillCharacterRepo.getCharacterIdsBySkillIds(skillIds)
  }

  async migrateToRelationTables(projectId: string): Promise<number> {
    return this.skillCharacterRepo.migrateFromJson(projectId)
  }

  private generateId(): string {
    return `skill_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
