/**
 * 分镜角色仓库
 * @module database/repositories/storyboard-character.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import { StoryboardCharacter } from '@shared/types/story-to-video.types'
import { StoryboardCharacterEntity } from '../entities/storyboard-character.entity'
import { BaseRepository } from '../base-repository'

type Facing =
  | 'front'
  | 'left'
  | 'right'
  | 'back'
  | 'three_quarter_left'
  | 'three_quarter_right'

export interface CreateStoryboardCharacterRequest {
  storyboardId: string
  characterId: string
  positionX?: number
  positionY?: number
  positionScale?: number
  expression?: string
  action?: string
  facing?: Facing
  sortOrder: number
}

export interface UpdateStoryboardCharacterRequest {
  characterId?: string
  positionX?: number
  positionY?: number
  positionScale?: number
  expression?: string
  action?: string
  facing?: Facing
  sortOrder?: number
}

export class StoryboardCharacterRepository extends BaseRepository<
  StoryboardCharacterEntity,
  StoryboardCharacter
> {
  constructor(dataSource: DataSource) {
    super(dataSource, StoryboardCharacterEntity)
  }

  protected toDto(e: StoryboardCharacterEntity): StoryboardCharacter {
    return {
      characterId: e.characterId,
      position: {
        x: e.positionX,
        y: e.positionY,
        scale: e.positionScale,
      },
      expression: e.expression || undefined,
      action: e.action || undefined,
      facing: e.facing as Facing,
    }
  }

  async getByStoryboardId(
    storyboardId: string,
  ): Promise<StoryboardCharacter[]> {
    return this.findManyByWhere(
      { storyboardId } as any,
      { sortOrder: 'ASC' },
    )
  }

  async getById(id: string): Promise<StoryboardCharacter | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(
    data: CreateStoryboardCharacterRequest,
  ): Promise<StoryboardCharacter> {
    const id = this.generateId()
    const entity = this.repo.create({
      id,
      storyboardId: data.storyboardId,
      characterId: data.characterId,
      positionX: data.positionX ?? 50,
      positionY: data.positionY ?? 50,
      positionScale: data.positionScale ?? 1.0,
      expression: data.expression ?? null,
      action: data.action ?? null,
      facing: data.facing || 'front',
      sortOrder: data.sortOrder,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async createMany(
    characters: CreateStoryboardCharacterRequest[],
  ): Promise<StoryboardCharacter[]> {
    if (characters.length === 0) return []
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(StoryboardCharacterEntity)
      const result: StoryboardCharacter[] = []
      for (const data of characters) {
        const id = this.generateId()
        const saved = await repo.save(
          repo.create({
            id,
            storyboardId: data.storyboardId,
            characterId: data.characterId,
            positionX: data.positionX ?? 50,
            positionY: data.positionY ?? 50,
            positionScale: data.positionScale ?? 1.0,
            expression: data.expression ?? null,
            action: data.action ?? null,
            facing: data.facing || 'front',
            sortOrder: data.sortOrder,
          }),
        )
        result.push(this.toDto(saved))
      }
      return result
    })
  }

  async update(
    id: string,
    data: UpdateStoryboardCharacterRequest,
  ): Promise<StoryboardCharacter | null> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return null

    let changed = false
    if (data.characterId !== undefined) { existing.characterId = data.characterId; changed = true }
    if (data.positionX !== undefined) { existing.positionX = data.positionX; changed = true }
    if (data.positionY !== undefined) { existing.positionY = data.positionY; changed = true }
    if (data.positionScale !== undefined) { existing.positionScale = data.positionScale; changed = true }
    if (data.expression !== undefined) { existing.expression = data.expression ?? null; changed = true }
    if (data.action !== undefined) { existing.action = data.action ?? null; changed = true }
    if (data.facing !== undefined) { existing.facing = data.facing; changed = true }
    if (data.sortOrder !== undefined) { existing.sortOrder = data.sortOrder; changed = true }

    if (!changed) return this.toDto(existing)

    const saved = await this.repo.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async deleteByStoryboardId(storyboardId: string): Promise<number> {
    const result = await this.repo.delete({ storyboardId } as any)
    return result.affected ?? 0
  }

  async countByStoryboardId(storyboardId: string): Promise<number> {
    return this.repo.count({ where: { storyboardId } as any })
  }

  private generateId(): string {
    return `stc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
