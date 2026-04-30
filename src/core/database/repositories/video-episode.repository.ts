/**
 * 剧集仓库
 * @module database/repositories/video-episode.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 *              逻辑删除（deleted_at IS NULL）在所有查询中过滤。
 */

import { IsNull, type DataSource } from 'typeorm'
import {
  VideoEpisode,
  AudioTrack,
  EpisodeStatus,
  EpisodeSourceType,
  UploadedCharacter,
} from '@shared/types/story-to-video.types'
import { VideoEpisodeEntity } from '../entities/video-episode.entity'
import { BaseRepository } from '../base-repository'

export interface CreateVideoEpisodeRequest {
  projectId: string
  sourceType: EpisodeSourceType
  outlineId?: string
  uploadedContent?: string
  uploadedCharacters?: UploadedCharacter[]
  episodeNumber: number
  title: string
}

export interface UpdateVideoEpisodeRequest {
  title?: string
  status?: EpisodeStatus
  duration?: number
  scriptId?: string
  audioTracks?: AudioTrack[]
  uploadedCharacters?: UploadedCharacter[]
}

export class VideoEpisodeRepository extends BaseRepository<
  VideoEpisodeEntity,
  VideoEpisode
> {
  constructor(dataSource: DataSource) {
    super(dataSource, VideoEpisodeEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: VideoEpisodeEntity): VideoEpisode {
    return {
      id: e.id,
      projectId: e.projectId,
      sourceType: e.sourceType as EpisodeSourceType,
      outlineId: e.outlineId || undefined,
      uploadedContent: e.uploadedContent || undefined,
      uploadedCharacters:
        (e.uploadedCharacters as UploadedCharacter[] | null) ?? undefined,
      episodeNumber: e.episodeNumber,
      title: e.title,
      status: e.status as EpisodeStatus,
      duration: e.duration,
      scriptId: e.scriptId || undefined,
      audioTracks: ((e.audioTracks as AudioTrack[] | null) ?? []) as AudioTrack[],
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async getByProjectId(projectId: string): Promise<VideoEpisode[]> {
    const entities = await this.repo.find({
      where: { projectId, deletedAt: IsNull() } as any,
      order: { episodeNumber: 'ASC' } as any,
    })
    return this.toDtoList(entities)
  }

  async getById(id: string): Promise<VideoEpisode | null> {
    const entity = await this.repo.findOne({
      where: { id, deletedAt: IsNull() } as any,
    })
    return entity ? this.toDto(entity) : null
  }

  async getByOutlineId(
    projectId: string,
    outlineId: string,
  ): Promise<VideoEpisode | null> {
    const entity = await this.repo.findOne({
      where: { projectId, outlineId, deletedAt: IsNull() } as any,
    })
    return entity ? this.toDto(entity) : null
  }

  async create(data: CreateVideoEpisodeRequest): Promise<VideoEpisode> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      sourceType: data.sourceType,
      outlineId: data.outlineId ?? null,
      uploadedContent: data.uploadedContent ?? null,
      uploadedCharacters:
        (data.uploadedCharacters as unknown[] | undefined) ?? null,
      episodeNumber: data.episodeNumber,
      title: data.title,
      status: 'pending',
      duration: 0,
      scriptId: null,
      audioTracks: [] as unknown[],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async createMany(
    episodes: CreateVideoEpisodeRequest[],
  ): Promise<VideoEpisode[]> {
    if (episodes.length === 0) return []
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(VideoEpisodeEntity)
      const result: VideoEpisode[] = []
      const now = new Date()
      for (const data of episodes) {
        const id = this.generateId()
        const saved = await repo.save(
          repo.create({
            id,
            projectId: data.projectId,
            sourceType: data.sourceType,
            outlineId: data.outlineId ?? null,
            uploadedContent: data.uploadedContent ?? null,
            uploadedCharacters:
              (data.uploadedCharacters as unknown[] | undefined) ?? null,
            episodeNumber: data.episodeNumber,
            title: data.title,
            status: 'pending',
            duration: 0,
            scriptId: null,
            audioTracks: [] as unknown[],
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          }),
        )
        result.push(this.toDto(saved))
      }
      return result
    })
  }

  async update(
    id: string,
    data: UpdateVideoEpisodeRequest,
  ): Promise<VideoEpisode | null> {
    const existing = await this.repo.findOne({
      where: { id, deletedAt: IsNull() } as any,
    })
    if (!existing) return null

    let changed = false
    if (data.title !== undefined) { existing.title = data.title; changed = true }
    if (data.status !== undefined) { existing.status = data.status; changed = true }
    if (data.duration !== undefined) { existing.duration = data.duration; changed = true }
    if (data.scriptId !== undefined) { existing.scriptId = data.scriptId ?? null; changed = true }
    if (data.audioTracks !== undefined) {
      existing.audioTracks = data.audioTracks as unknown[]
      changed = true
    }
    if (data.uploadedCharacters !== undefined) {
      existing.uploadedCharacters = data.uploadedCharacters as unknown[]
      changed = true
    }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.repo.save(existing)
    return this.toDto(saved)
  }

  /** 逻辑删除 */
  async delete(id: string): Promise<boolean> {
    const now = new Date()
    const result = await this.repo.update({ id } as any, {
      deletedAt: now,
      updatedAt: now,
    })
    return (result.affected ?? 0) > 0
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    const now = new Date()
    const result = await this.repo.update({ projectId } as any, {
      deletedAt: now,
      updatedAt: now,
    })
    return result.affected ?? 0
  }

  async restore(id: string): Promise<boolean> {
    const result = await this.repo.update({ id } as any, {
      deletedAt: null,
      updatedAt: new Date(),
    })
    return (result.affected ?? 0) > 0
  }

  async countByProjectId(projectId: string): Promise<number> {
    // 与原行为一致：含逻辑删除的也算
    return this.repo.count({ where: { projectId } as any })
  }

  private generateId(): string {
    return `ve_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
