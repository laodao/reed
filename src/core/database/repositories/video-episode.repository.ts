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
  UploadedLocation,
  UploadedItem,
} from '@shared/types/story-to-video.types'
import { VideoEpisodeEntity } from '../entities/episode-production/video-episode.entity'
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
  episodeNumber?: number
  title?: string
  status?: EpisodeStatus
  duration?: number
  scriptId?: string
  audioTracks?: AudioTrack[]
  uploadedContent?: string
  uploadedCharacters?: UploadedCharacter[]
  uploadedLocations?: UploadedLocation[]
  uploadedItems?: UploadedItem[]
  // ─── 故事背景（spec 2026-05-08）───
  /** 故事年代（如"民国初年"/"唐代盛世"），null 表示清空 */
  storyEra?: string | null
  /** 故事地域 */
  storyRegion?: string | null
  /** 其他背景描述（自由文本） */
  storyBackgroundExtra?: string | null
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
      uploadedLocations:
        ((e as any).uploadedLocations as UploadedLocation[] | null) ?? undefined,
      uploadedItems:
        ((e as any).uploadedItems as UploadedItem[] | null) ?? undefined,
      episodeNumber: e.episodeNumber,
      title: e.title,
      status: e.status as EpisodeStatus,
      duration: e.duration,
      scriptId: e.scriptId || undefined,
      audioTracks: ((e.audioTracks as AudioTrack[] | null) ?? []) as AudioTrack[],
      storyEra: (e as any).storyEra ?? undefined,
      storyRegion: (e as any).storyRegion ?? undefined,
      storyBackgroundExtra: (e as any).storyBackgroundExtra ?? undefined,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async getByProjectId(projectId: string): Promise<VideoEpisode[]> {
    const entities = await this.scoped.find({
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
    const saved = await this.scoped.save(entity)
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
    if (data.episodeNumber !== undefined) { existing.episodeNumber = data.episodeNumber; changed = true }
    if (data.title !== undefined) { existing.title = data.title; changed = true }
    if (data.status !== undefined) { existing.status = data.status; changed = true }
    if (data.duration !== undefined) { existing.duration = data.duration; changed = true }
    if (data.scriptId !== undefined) { existing.scriptId = data.scriptId ?? null; changed = true }
    if (data.audioTracks !== undefined) {
      existing.audioTracks = data.audioTracks as unknown[]
      changed = true
    }
    if (data.uploadedContent !== undefined) {
      existing.uploadedContent = data.uploadedContent ?? null
      changed = true
    }
    if (data.uploadedCharacters !== undefined) {
      existing.uploadedCharacters = data.uploadedCharacters as unknown[]
      changed = true
    }
    if (data.uploadedLocations !== undefined) {
      ;(existing as any).uploadedLocations = data.uploadedLocations as unknown[]
      changed = true
    }
    if (data.uploadedItems !== undefined) {
      ;(existing as any).uploadedItems = data.uploadedItems as unknown[]
      changed = true
    }
    if (data.storyEra !== undefined) {
      ;(existing as any).storyEra = data.storyEra
      changed = true
    }
    if (data.storyRegion !== undefined) {
      ;(existing as any).storyRegion = data.storyRegion
      changed = true
    }
    if (data.storyBackgroundExtra !== undefined) {
      ;(existing as any).storyBackgroundExtra = data.storyBackgroundExtra
      changed = true
    }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  /** 逻辑删除 */
  async delete(id: string): Promise<boolean> {
    const now = new Date()
    const affected = await this.scoped.update({ id } as any, {
      deletedAt: now,
      updatedAt: now,
    })
    return affected > 0
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    const now = new Date()
    return this.scoped.update({ projectId } as any, {
      deletedAt: now,
      updatedAt: now,
    } as any)
  }

  async restore(id: string): Promise<boolean> {
    const affected = await this.scoped.update({ id } as any, {
      deletedAt: null,
      updatedAt: new Date(),
    })
    return affected > 0
  }

  async countByProjectId(projectId: string): Promise<number> {
    // 与原行为一致：含逻辑删除的也算
    return this.scoped.count({ projectId } as any)
  }

  private generateId(): string {
    return `ve_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
