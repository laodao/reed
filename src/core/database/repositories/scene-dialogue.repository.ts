/**
 * 场景对话仓库
 * @module database/repositories/scene-dialogue.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import { Dialogue } from '@shared/types/story-to-video.types'
import { SceneDialogueEntity } from '../entities/episode-production/scene-dialogue.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface CreateSceneDialogueRequest {
  sceneScriptId: string
  characterId: string
  characterName: string
  /** spec §4.1：character_binding.id 强引用 */
  characterBindingId?: string | null
  text: string
  emotion?: string
  volume?: 'normal' | 'loud' | 'whisper'
  pace?: 'normal' | 'fast' | 'slow'
  pause?: number
  voiceId?: string
  audioAssetId?: string
  sortOrder: number
}

export interface UpdateSceneDialogueRequest {
  characterId?: string
  characterName?: string
  /** spec §4.1：character_binding.id 强引用 */
  characterBindingId?: string | null
  text?: string
  emotion?: string
  volume?: 'normal' | 'loud' | 'whisper'
  pace?: 'normal' | 'fast' | 'slow'
  pause?: number
  voiceId?: string
  audioAssetId?: string
  sortOrder?: number
}

export class SceneDialogueRepository extends BaseRepository<
  SceneDialogueEntity,
  Dialogue
> {
  constructor(dataSource: DataSource) {
    super(dataSource, SceneDialogueEntity)
  }

  protected toDto(e: SceneDialogueEntity): Dialogue {
    return {
      id: e.id,
      characterId: e.characterId,
      characterName: e.characterName,
      characterBindingId: e.characterBindingId,
      text: e.text,
      emotion: e.emotion || undefined,
      volume: (e.volume as 'normal' | 'loud' | 'whisper') || 'normal',
      pace: (e.pace as 'normal' | 'fast' | 'slow') || 'normal',
      pause: e.pause || 0,
      voiceId: e.voiceId || undefined,
    }
  }

  async getBySceneScriptId(sceneScriptId: string): Promise<Dialogue[]> {
    return this.findManyByWhere(
      { sceneScriptId } as any,
      { sortOrder: 'ASC' },
    )
  }

  async getById(id: string): Promise<Dialogue | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(data: CreateSceneDialogueRequest): Promise<Dialogue> {
    const id = this.generateId()
    const entity = this.repo.create({
      id,
      sceneScriptId: data.sceneScriptId,
      characterId: data.characterId,
      characterName: data.characterName,
      characterBindingId: data.characterBindingId ?? null,
      text: data.text,
      emotion: data.emotion ?? null,
      volume: data.volume || 'normal',
      pace: data.pace || 'normal',
      pause: data.pause || 0,
      voiceId: data.voiceId ?? null,
      audioAssetId: data.audioAssetId ?? null,
      sortOrder: data.sortOrder,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async createMany(
    dialogues: CreateSceneDialogueRequest[],
  ): Promise<Dialogue[]> {
    if (dialogues.length === 0) return []
    // 多租户复核修复：事务内裸 repo.save 不走 scoped，必须显式注入 userId
    const userId = getCurrentUserId() ?? null
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(SceneDialogueEntity)
      const result: Dialogue[] = []
      for (const data of dialogues) {
        const id = this.generateId()
        const saved = await repo.save(
          repo.create({
            id,
            userId,
            sceneScriptId: data.sceneScriptId,
            characterId: data.characterId,
            characterName: data.characterName,
            characterBindingId: data.characterBindingId ?? null,
            text: data.text,
            emotion: data.emotion ?? null,
            volume: data.volume || 'normal',
            pace: data.pace || 'normal',
            pause: data.pause || 0,
            voiceId: data.voiceId ?? null,
            audioAssetId: data.audioAssetId ?? null,
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
    data: UpdateSceneDialogueRequest,
  ): Promise<Dialogue | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.characterId !== undefined) { existing.characterId = data.characterId; changed = true }
    if (data.characterName !== undefined) { existing.characterName = data.characterName; changed = true }
    if (data.characterBindingId !== undefined) { existing.characterBindingId = data.characterBindingId ?? null; changed = true }
    if (data.text !== undefined) { existing.text = data.text; changed = true }
    if (data.emotion !== undefined) { existing.emotion = data.emotion ?? null; changed = true }
    if (data.volume !== undefined) { existing.volume = data.volume; changed = true }
    if (data.pace !== undefined) { existing.pace = data.pace; changed = true }
    if (data.pause !== undefined) { existing.pause = data.pause; changed = true }
    if (data.voiceId !== undefined) { existing.voiceId = data.voiceId ?? null; changed = true }
    if (data.audioAssetId !== undefined) { existing.audioAssetId = data.audioAssetId ?? null; changed = true }
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
    return `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
