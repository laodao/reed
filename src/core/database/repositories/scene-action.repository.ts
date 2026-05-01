/**
 * 场景动作仓库
 * @module database/repositories/scene-action.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import { ActionDescription } from '@shared/types/story-to-video.types'
import { SceneActionEntity } from '../entities/scene-action.entity'
import { BaseRepository } from '../base-repository'

export interface CreateSceneActionRequest {
  sceneScriptId: string
  characterId?: string
  description: string
  timing?: 'before' | 'during' | 'after'
  duration?: number
  sortOrder: number
}

export interface UpdateSceneActionRequest {
  characterId?: string
  description?: string
  timing?: 'before' | 'during' | 'after'
  duration?: number
  sortOrder?: number
}

export class SceneActionRepository extends BaseRepository<
  SceneActionEntity,
  ActionDescription
> {
  constructor(dataSource: DataSource) {
    super(dataSource, SceneActionEntity)
  }

  protected toDto(e: SceneActionEntity): ActionDescription {
    return {
      characterId: e.characterId || undefined,
      description: e.description,
      timing: (e.timing as 'before' | 'during' | 'after') || 'during',
      duration: e.duration ?? undefined,
    } as ActionDescription
  }

  async getBySceneScriptId(sceneScriptId: string): Promise<ActionDescription[]> {
    return this.findManyByWhere(
      { sceneScriptId } as any,
      { sortOrder: 'ASC' },
    )
  }

  async getById(id: string): Promise<ActionDescription | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(data: CreateSceneActionRequest): Promise<ActionDescription> {
    const id = this.generateId()
    const entity = this.repo.create({
      id,
      sceneScriptId: data.sceneScriptId,
      characterId: data.characterId ?? null,
      description: data.description,
      timing: data.timing || 'during',
      duration: data.duration ?? null,
      sortOrder: data.sortOrder,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async createMany(
    actions: CreateSceneActionRequest[],
  ): Promise<ActionDescription[]> {
    if (actions.length === 0) return []
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(SceneActionEntity)
      const result: ActionDescription[] = []
      for (const data of actions) {
        const id = this.generateId()
        const saved = await repo.save(
          repo.create({
            id,
            sceneScriptId: data.sceneScriptId,
            characterId: data.characterId ?? null,
            description: data.description,
            timing: data.timing || 'during',
            duration: data.duration ?? null,
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
    data: UpdateSceneActionRequest,
  ): Promise<ActionDescription | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.characterId !== undefined) { existing.characterId = data.characterId ?? null; changed = true }
    if (data.description !== undefined) { existing.description = data.description; changed = true }
    if (data.timing !== undefined) { existing.timing = data.timing; changed = true }
    if (data.duration !== undefined) { existing.duration = data.duration ?? null; changed = true }
    if (data.sortOrder !== undefined) { existing.sortOrder = data.sortOrder; changed = true }

    if (!changed) return this.toDto(existing)

    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteBySceneScriptId(sceneScriptId: string): Promise<number> {
    return this.scoped.delete({ sceneScriptId } as any)
  }

  async countBySceneScriptId(sceneScriptId: string): Promise<number> {
    return this.scoped.count({ sceneScriptId } as any)
  }

  private generateId(): string {
    return `act_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
