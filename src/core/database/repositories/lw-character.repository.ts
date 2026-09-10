/**
 * 长文写作角色仓库
 * @module database/repositories/lw-character.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  StoryCharacter,
  CreateCharacterRequest,
  UpdateCharacterRequest,
  CharacterRelation,
  EntityImportance,
  TemporaryCharacterTemplateType,
  EntitySourceType,
} from '@shared/types/longwriting.types'
import { LwCharacterEntity } from '../entities/lw-character.entity'
import { LwCharacterRelationEntity } from '../entities/lw-character-relation.entity'
import { BaseRepository } from '../base-repository'

export class LwCharacterRepository extends BaseRepository<
  LwCharacterEntity,
  StoryCharacter
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwCharacterEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: LwCharacterEntity): StoryCharacter {
    return {
      id: e.id,
      projectId: e.projectId,
      // portraitId / generatedImageId 已从 entity 移除（数据在 character_bindings / asset_image）
      name: e.name,
      gender: e.gender as any,
      age: e.age ?? undefined,
      height: e.height ?? undefined,
      weight: e.weight ?? undefined,
      race: e.race as any,
      occupation: e.occupation ?? undefined,
      position: e.position ?? undefined,
      appearance: e.appearance ?? '',
      background: e.background ?? '',
      personality: e.personality ?? '',
      abilities: e.abilities ?? '',
      aliases: (() => { try { const v = e.aliases ? JSON.parse(e.aliases) : null; return Array.isArray(v) ? v : undefined } catch { return undefined } })(),
      rolePosition: e.rolePosition as any,
      importance: (e.importance as EntityImportance) || 'secondary',
      templateType: (e.templateType as TemporaryCharacterTemplateType | null) ?? undefined,
      majorEvents: e.majorEvents ?? '',
      sourceType: (e.sourceType as EntitySourceType) || 'longwriting',
      sourceEpisodeId: e.sourceEpisodeId ?? undefined,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    } as StoryCharacter
  }

  async getByProjectId(projectId: string): Promise<StoryCharacter[]> {
    return this.findManyByWhere({ projectId } as any, { createdAt: 'ASC' })
  }

  async getTemporaryByProjectId(projectId: string): Promise<StoryCharacter[]> {
    return this.findManyByWhere(
      { projectId, importance: 'temporary' } as any,
      { createdAt: 'ASC' },
    )
  }

  async getById(id: string): Promise<StoryCharacter | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getBySourceEpisodeId(episodeId: string): Promise<StoryCharacter[]> {
    return this.findManyByWhere(
      { sourceEpisodeId: episodeId } as any,
      { createdAt: 'ASC' },
    )
  }

  async getByPortraitId(portraitId: string): Promise<StoryCharacter[]> {
    // portraitId 字段已从 entity 移除，此方法暂时返回空数组（消费方应改为从 character_bindings 查询）
    // TODO: 后续 task 中从 character_bindings 表查询
    void portraitId
    return []
  }

  /** 数组转字符串，对象 JSON 序列化（保留原行为） */
  private normalizeValue(value: any): string {
    if (value === null || value === undefined) return ''
    if (Array.isArray(value)) return value.join('、')
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  async create(data: CreateCharacterRequest): Promise<StoryCharacter> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      // portraitId / generatedImageId 已从 entity 移除，create 时忽略（数据存 character_bindings / asset_image）
      name: this.normalizeValue(data.name),
      gender: data.gender || 'male',
      age: data.age ?? 25,
      height: data.height ?? null,
      weight: data.weight ?? null,
      race: data.race ?? null,
      occupation: data.occupation ?? null,
      position: data.position ?? null,
      appearance: this.normalizeValue(data.appearance),
      background: this.normalizeValue(data.background),
      personality: this.normalizeValue(data.personality),
      abilities: this.normalizeValue(data.abilities),
      aliases: data.aliases ? JSON.stringify(data.aliases) : null,
      rolePosition: data.rolePosition || 'supporting',
      majorEvents: this.normalizeValue(data.majorEvents),
      importance: data.importance || 'secondary',
      templateType: data.templateType ?? null,
      sourceType: data.sourceType || 'longwriting',
      sourceEpisodeId: data.sourceEpisodeId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: UpdateCharacterRequest,
  ): Promise<StoryCharacter | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    const apply = <T extends keyof LwCharacterEntity>(
      field: T,
      value: LwCharacterEntity[T] | undefined,
    ) => {
      if (value !== undefined) {
        (existing as any)[field] = value
        changed = true
      }
    }

    // portraitId / generatedImageId 已从 entity 移除，update 时忽略
    apply('name', data.name as any)
    apply('gender', data.gender as any)
    apply('age', data.age as any)
    apply('height', data.height as any)
    apply('weight', data.weight as any)
    apply('race', data.race as any)
    apply('occupation', data.occupation as any)
    apply('position', data.position as any)
    apply('appearance', data.appearance as any)
    apply('background', data.background as any)
    apply('personality', data.personality as any)
    apply('abilities', data.abilities as any)
    if (data.aliases !== undefined) {
      existing.aliases = data.aliases ? JSON.stringify(data.aliases) : null
      changed = true
    }
    apply('rolePosition', data.rolePosition as any)
    apply('importance', data.importance as any)
    apply('templateType', data.templateType as any)
    apply('majorEvents', data.majorEvents as any)
    apply('sourceType', data.sourceType as any)
    if (data.sourceEpisodeId !== undefined) {
      existing.sourceEpisodeId = data.sourceEpisodeId === '' ? null : data.sourceEpisodeId
      changed = true
    }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  /** lw_character_relations 表的 scoped 入口（user_id 自动注入/过滤）。 */
  private get relations() {
    return this.scopedFor(LwCharacterRelationEntity)
  }

  async getRelations(characterId: string): Promise<CharacterRelation[]> {
    const rows = await this.relations.find({ where: { characterId } as any })
    return rows.map(r => ({
      id: r.id,
      characterId: r.characterId,
      relatedCharacterId: r.relatedCharacterId,
      relationType: r.relationType ?? '',
      relationDescription: r.relationDescription ?? '',
      createdAt:
        r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt),
    }))
  }

  async addRelation(
    characterId: string,
    relatedCharacterId: string,
    relationType: string,
    relationDescription: string,
  ): Promise<CharacterRelation> {
    const id = this.generateRelationId()
    const now = new Date()
    const saved = await this.relations.save({
      id,
      characterId,
      relatedCharacterId,
      relationType,
      relationDescription,
      createdAt: now,
    } as any)
    return {
      id: saved.id,
      characterId: saved.characterId,
      relatedCharacterId: saved.relatedCharacterId,
      relationType: saved.relationType ?? '',
      relationDescription: saved.relationDescription ?? '',
      createdAt:
        saved.createdAt instanceof Date
          ? saved.createdAt.getTime()
          : Number(saved.createdAt),
    }
  }

  async deleteRelation(id: string): Promise<boolean> {
    const affected = await this.relations.delete({ id } as any)
    return affected > 0
  }

  private generateId(): string {
    return `char_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  private generateRelationId(): string {
    return `rel_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
