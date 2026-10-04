/**
 * 场景角色仓库
 * @module database/repositories/scene-character.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  SceneCharacter,
} from '@shared/types/story-to-video.types'
import { SceneCharacterEntity } from '../entities/episode-production/scene-character.entity'
import { ScenePropEntity } from '../entities/episode-production/scene-prop.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface CreateSceneCharacterRequest {
  sceneScriptId: string
  characterId: string
  characterName: string
  /** spec §4.1：character_binding.id 强引用 */
  characterBindingId?: string | null
  position?: 'left' | 'center' | 'right' | 'foreground' | 'background'
  expression?: string
  action?: string
  outfit?: string
  props?: string[]
  sortOrder: number
}

export interface UpdateSceneCharacterRequest {
  characterId?: string
  characterName?: string
  /** spec §4.1：character_binding.id 强引用 */
  characterBindingId?: string | null
  position?: 'left' | 'center' | 'right' | 'foreground' | 'background'
  expression?: string
  action?: string
  outfit?: string
  props?: string[]
  sortOrder?: number
}

export class SceneCharacterRepository extends BaseRepository<
  SceneCharacterEntity,
  SceneCharacter
> {
  constructor(dataSource: DataSource) {
    super(dataSource, SceneCharacterEntity)
  }

  protected toDto(_e: SceneCharacterEntity): SceneCharacter {
    throw new Error('use mapToDto with props injection')
  }

  private mapToDto(
    e: SceneCharacterEntity,
    props: string[],
  ): SceneCharacter {
    return {
      characterId: e.characterId,
      characterName: e.characterName,
      characterBindingId: e.characterBindingId,
      position: (e.position as
        | 'left'
        | 'center'
        | 'right'
        | 'foreground'
        | 'background'
        | undefined) || undefined,
      expression: e.expression || undefined,
      action: e.action || undefined,
      outfit: e.outfit || undefined,
      props: props.length > 0 ? props : undefined,
    }
  }

  private async getProps(characterId: string): Promise<string[]> {
    const propRepo = this.dataSource.getRepository(ScenePropEntity)
    const rows = await propRepo.find({
      where: { sceneCharacterId: characterId } as any,
      select: ['propName'],
    })
    return rows.map(r => r.propName)
  }

  async getBySceneScriptId(sceneScriptId: string): Promise<SceneCharacter[]> {
    const entities = await this.scoped.find({
      where: { sceneScriptId } as any,
      order: { sortOrder: 'ASC' } as any,
    })
    const result: SceneCharacter[] = []
    for (const e of entities) {
      result.push(this.mapToDto(e, await this.getProps(e.id)))
    }
    return result
  }

  async getById(id: string): Promise<SceneCharacter | null> {
    const e = await this.scoped.findOne({ id } as any)
    if (!e) return null
    return this.mapToDto(e, await this.getProps(e.id))
  }

  async create(data: CreateSceneCharacterRequest): Promise<SceneCharacter> {
    const id = this.generateId()
    // 多租户复核修复：事务内裸 repo.save 不走 scoped，必须显式注入 userId
    const userId = getCurrentUserId() ?? null
    return this.dataSource.transaction(async manager => {
      const charRepo = manager.getRepository(SceneCharacterEntity)
      const propRepo = manager.getRepository(ScenePropEntity)
      await charRepo.save(
        charRepo.create({
          id,
          userId,
          sceneScriptId: data.sceneScriptId,
          characterId: data.characterId,
          characterName: data.characterName,
          characterBindingId: data.characterBindingId ?? null,
          position: data.position || 'center',
          expression: data.expression ?? null,
          action: data.action ?? null,
          outfit: data.outfit ?? null,
          sortOrder: data.sortOrder,
        }),
      )
      if (data.props && data.props.length > 0) {
        for (const prop of data.props) {
          await propRepo.save(
            propRepo.create({
              id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
              userId,
              sceneCharacterId: id,
              propName: prop,
            }),
          )
        }
      }
      return {
        characterId: data.characterId,
        characterName: data.characterName,
        characterBindingId: data.characterBindingId ?? null,
        position: data.position,
        expression: data.expression,
        action: data.action,
        outfit: data.outfit,
        props: data.props || [],
      }
    })
  }

  async createMany(
    characters: CreateSceneCharacterRequest[],
  ): Promise<SceneCharacter[]> {
    if (characters.length === 0) return []
    return this.dataSource.transaction(async () => {
      const result: SceneCharacter[] = []
      for (const data of characters) {
        result.push(await this.create(data))
      }
      return result
    })
  }

  async update(
    id: string,
    data: UpdateSceneCharacterRequest,
  ): Promise<SceneCharacter | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    return this.dataSource.transaction(async manager => {
      const charRepo = manager.getRepository(SceneCharacterEntity)
      const propRepo = manager.getRepository(ScenePropEntity)
      const userId = getCurrentUserId()
      const userScope = userId ? { userId } : {}

      let changed = false
      if (data.characterId !== undefined) { existing.characterId = data.characterId; changed = true }
      if (data.characterName !== undefined) { existing.characterName = data.characterName; changed = true }
      if (data.characterBindingId !== undefined) { existing.characterBindingId = data.characterBindingId ?? null; changed = true }
      if (data.position !== undefined) { existing.position = data.position; changed = true }
      if (data.expression !== undefined) { existing.expression = data.expression ?? null; changed = true }
      if (data.action !== undefined) { existing.action = data.action ?? null; changed = true }
      if (data.outfit !== undefined) { existing.outfit = data.outfit ?? null; changed = true }
      if (data.sortOrder !== undefined) { existing.sortOrder = data.sortOrder; changed = true }

      if (changed) await charRepo.save(existing)

      if (data.props !== undefined) {
        await propRepo.delete({ sceneCharacterId: id, ...userScope } as any)
        for (const prop of data.props) {
          await propRepo.save(
            propRepo.create({
              id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
              userId: userId ?? null,
              sceneCharacterId: id,
              propName: prop,
            }),
          )
        }
      }

      const props = await this.getProps(id)
      return this.mapToDto(existing, props)
    })
  }

  async delete(id: string): Promise<boolean> {
    const userId = getCurrentUserId()
    const userScope = userId ? { userId } : {}
    return this.dataSource.transaction(async manager => {
      await manager.delete(ScenePropEntity, { sceneCharacterId: id, ...userScope } as any)
      const result = await manager.delete(SceneCharacterEntity, { id, ...userScope } as any)
      return (result.affected ?? 0) > 0
    })
  }

  async deleteBySceneScriptId(sceneScriptId: string): Promise<number> {
    const userId = getCurrentUserId()
    const userScope = userId ? { userId } : {}
    return this.dataSource.transaction(async manager => {
      const charRepo = manager.getRepository(SceneCharacterEntity)
      const propRepo = manager.getRepository(ScenePropEntity)
      const characters = await charRepo.find({
        where: { sceneScriptId, ...userScope } as any,
        select: ['id'],
      })
      for (const c of characters) {
        await propRepo.delete({ sceneCharacterId: c.id, ...userScope } as any)
      }
      const result = await charRepo.delete({ sceneScriptId, ...userScope } as any)
      return result.affected ?? 0
    })
  }

  async countBySceneScriptId(sceneScriptId: string): Promise<number> {
    return this.scoped.count({ sceneScriptId } as any)
  }

  private generateId(): string {
    return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
