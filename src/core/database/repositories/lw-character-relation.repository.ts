/**
 * LW 角色关系仓库
 * @module database/repositories/lw-character-relation.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import { LwCharacterRelationEntity } from '../entities/lw-character-relation.entity'
import { BaseRepository } from '../base-repository'

export interface CharacterRelation {
  id: string
  characterId: string
  relatedCharacterId: string
  relationType: string
  relationDescription: string
  createdAt: number
}

export class LwCharacterRelationRepository extends BaseRepository<
  LwCharacterRelationEntity,
  CharacterRelation
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwCharacterRelationEntity)
  }

  protected toDto(e: LwCharacterRelationEntity): CharacterRelation {
    return {
      id: e.id,
      characterId: e.characterId,
      relatedCharacterId: e.relatedCharacterId,
      relationType: e.relationType ?? '',
      relationDescription: e.relationDescription ?? '',
      createdAt: e.createdAt instanceof Date
        ? e.createdAt.getTime()
        : Number(e.createdAt) || 0,
    }
  }

  async getByCharacterId(characterId: string): Promise<CharacterRelation[]> {
    return this.findManyByWhere({ characterId } as any)
  }

  async create(data: {
    characterId: string
    relatedCharacterId: string
    relationType: string
    relationDescription: string
  }): Promise<CharacterRelation> {
    const id = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    const createdAt = new Date()
    await this.repo.save(
      this.repo.create({
        id,
        characterId: data.characterId,
        relatedCharacterId: data.relatedCharacterId,
        relationType: data.relationType,
        relationDescription: data.relationDescription,
        createdAt,
      }),
    )
    return {
      id,
      characterId: data.characterId,
      relatedCharacterId: data.relatedCharacterId,
      relationType: data.relationType,
      relationDescription: data.relationDescription,
      createdAt: createdAt.getTime(),
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async deleteByCharacterId(characterId: string): Promise<number> {
    const result = await this.repo.delete({ characterId } as any)
    return result.affected ?? 0
  }
}
