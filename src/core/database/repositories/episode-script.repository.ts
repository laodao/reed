/**
 * 剧本仓库
 * @module database/repositories/episode-script.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  EpisodeScript,
  SceneScript,
  ScriptStatus,
} from '@shared/types/story-to-video.types'
import { EpisodeScriptEntity } from '../entities/episode-script.entity'
import { BaseRepository } from '../base-repository'

export interface CreateEpisodeScriptRequest {
  projectId: string
  episodeId: string
  outlineId: string
  synopsis?: string
  scriptContent?: string
  scriptFormat?: string
}

export interface UpdateEpisodeScriptRequest {
  synopsis?: string
  scriptContent?: string
  scriptFormat?: string
  scenes?: SceneScript[]
  totalDuration?: number
  characterAppearances?: string[]
  status?: ScriptStatus
}

export class EpisodeScriptRepository extends BaseRepository<
  EpisodeScriptEntity,
  EpisodeScript
> {
  constructor(dataSource: DataSource) {
    super(dataSource, EpisodeScriptEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: EpisodeScriptEntity): EpisodeScript {
    return {
      id: e.id,
      projectId: e.projectId,
      episodeId: e.episodeId,
      outlineId: e.outlineId,
      status: e.status as ScriptStatus,
      synopsis: e.synopsis ?? '',
      scriptContent: e.scriptContent ?? undefined,
      scriptFormat: e.scriptFormat ?? 'standard',
      scenes: ((e.scenes as SceneScript[] | null) ?? []) as SceneScript[],
      totalDuration: e.totalDuration ?? 0,
      characterAppearances: (e.characterAppearances as string[] | null) ?? [],
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async getByEpisodeId(episodeId: string): Promise<EpisodeScript | null> {
    return this.findOneByWhere({ episodeId } as any)
  }

  async getById(id: string): Promise<EpisodeScript | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getByProjectId(projectId: string): Promise<EpisodeScript[]> {
    return this.findManyByWhere({ projectId } as any, { createdAt: 'ASC' })
  }

  async create(data: CreateEpisodeScriptRequest): Promise<EpisodeScript> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      episodeId: data.episodeId,
      outlineId: data.outlineId,
      status: 'pending',
      synopsis: data.synopsis ?? '',
      scriptContent: data.scriptContent ?? null,
      scriptFormat: data.scriptFormat ?? 'standard',
      scenes: [] as unknown[],
      totalDuration: 0,
      characterAppearances: [] as string[],
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: UpdateEpisodeScriptRequest,
  ): Promise<EpisodeScript | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.synopsis !== undefined) { existing.synopsis = data.synopsis; changed = true }
    if (data.scriptContent !== undefined) { existing.scriptContent = data.scriptContent; changed = true }
    if (data.scriptFormat !== undefined) { existing.scriptFormat = data.scriptFormat; changed = true }
    if (data.scenes !== undefined) {
      existing.scenes = data.scenes as unknown[]; changed = true
    }
    if (data.totalDuration !== undefined) { existing.totalDuration = data.totalDuration; changed = true }
    if (data.characterAppearances !== undefined) {
      existing.characterAppearances = data.characterAppearances; changed = true
    }
    if (data.status !== undefined) { existing.status = data.status; changed = true }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  private generateId(): string {
    return `es_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
