/**
 * 场景剧本仓库
 * @module database/repositories/scene-script.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  SceneScript,
  SceneCharacter,
  Dialogue,
  ActionDescription,
  LocationType,
  TimeOfDay,
  WeatherType,
} from '@shared/types/story-to-video.types'
import { SceneScriptEntity } from '../entities/episode-production/scene-script.entity'
import { BaseRepository } from '../base-repository'

export interface CreateSceneScriptRequest {
  episodeScriptId: string
  sceneNumber: number
  location: string
  locationType: LocationType
  timeOfDay: TimeOfDay
  weather?: WeatherType
  sceneDescription: string
  mood: string
  lighting?: string
  characters: SceneCharacter[]
  originalText: string
  narration: string
  dialogues: Dialogue[]
  actions: ActionDescription[]
}

export interface UpdateSceneScriptRequest {
  location?: string
  locationType?: LocationType
  timeOfDay?: TimeOfDay
  weather?: WeatherType
  sceneDescription?: string
  mood?: string
  lighting?: string
  characters?: SceneCharacter[]
  originalText?: string
  narration?: string
  dialogues?: Dialogue[]
  actions?: ActionDescription[]
}

export class SceneScriptRepository extends BaseRepository<
  SceneScriptEntity,
  SceneScript
> {
  constructor(dataSource: DataSource) {
    super(dataSource, SceneScriptEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: SceneScriptEntity): SceneScript {
    return {
      id: e.id,
      episodeScriptId: e.episodeScriptId,
      sceneNumber: e.sceneNumber,
      location: e.location,
      locationType: e.locationType as LocationType,
      timeOfDay: e.timeOfDay as TimeOfDay,
      weather: (e.weather as WeatherType | null) ?? undefined,
      sceneDescription: e.sceneDescription,
      mood: e.mood ?? '',
      lighting: e.lighting ?? undefined,
      characters: ((e.characters as SceneCharacter[] | null) ?? []) as SceneCharacter[],
      originalText: e.originalText ?? '',
      narration: e.narration ?? '',
      dialogues: ((e.dialogues as Dialogue[] | null) ?? []) as Dialogue[],
      actions: ((e.actions as ActionDescription[] | null) ?? []) as ActionDescription[],
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async getByEpisodeScriptId(episodeScriptId: string): Promise<SceneScript[]> {
    return this.findManyByWhere(
      { episodeScriptId } as any,
      { sceneNumber: 'ASC' },
    )
  }

  async getById(id: string): Promise<SceneScript | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(data: CreateSceneScriptRequest): Promise<SceneScript> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      episodeScriptId: data.episodeScriptId,
      sceneNumber: data.sceneNumber,
      location: data.location,
      locationType: data.locationType,
      timeOfDay: data.timeOfDay,
      weather: data.weather ?? null,
      sceneDescription: data.sceneDescription,
      mood: data.mood,
      lighting: data.lighting ?? null,
      characters: data.characters as unknown[],
      originalText: data.originalText,
      narration: data.narration,
      dialogues: data.dialogues as unknown[],
      actions: data.actions as unknown[],
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async createMany(scenes: CreateSceneScriptRequest[]): Promise<SceneScript[]> {
    if (scenes.length === 0) return []
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(SceneScriptEntity)
      const result: SceneScript[] = []
      const now = new Date()
      for (const data of scenes) {
        const id = this.generateId()
        const saved = await repo.save(
          repo.create({
            id,
            episodeScriptId: data.episodeScriptId,
            sceneNumber: data.sceneNumber,
            location: data.location,
            locationType: data.locationType,
            timeOfDay: data.timeOfDay,
            weather: data.weather ?? null,
            sceneDescription: data.sceneDescription,
            mood: data.mood,
            lighting: data.lighting ?? null,
            characters: data.characters as unknown[],
            originalText: data.originalText,
            narration: data.narration,
            dialogues: data.dialogues as unknown[],
            actions: data.actions as unknown[],
            createdAt: now,
            updatedAt: now,
          }),
        )
        result.push(this.toDto(saved))
      }
      return result
    })
  }

  async update(
    id: string,
    data: UpdateSceneScriptRequest,
  ): Promise<SceneScript | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.location !== undefined) { existing.location = data.location; changed = true }
    if (data.locationType !== undefined) { existing.locationType = data.locationType; changed = true }
    if (data.timeOfDay !== undefined) { existing.timeOfDay = data.timeOfDay; changed = true }
    if (data.weather !== undefined) { existing.weather = data.weather ?? null; changed = true }
    if (data.sceneDescription !== undefined) { existing.sceneDescription = data.sceneDescription; changed = true }
    if (data.mood !== undefined) { existing.mood = data.mood; changed = true }
    if (data.lighting !== undefined) { existing.lighting = data.lighting ?? null; changed = true }
    if (data.characters !== undefined) {
      existing.characters = data.characters as unknown[]; changed = true
    }
    if (data.originalText !== undefined) { existing.originalText = data.originalText; changed = true }
    if (data.narration !== undefined) { existing.narration = data.narration; changed = true }
    if (data.dialogues !== undefined) {
      existing.dialogues = data.dialogues as unknown[]; changed = true
    }
    if (data.actions !== undefined) {
      existing.actions = data.actions as unknown[]; changed = true
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

  async deleteByEpisodeScriptId(episodeScriptId: string): Promise<number> {
    return this.scoped.delete({ episodeScriptId } as any)
  }

  async countByEpisodeScriptId(episodeScriptId: string): Promise<number> {
    return this.scoped.count({ episodeScriptId } as any)
  }

  private generateId(): string {
    return `ss_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
