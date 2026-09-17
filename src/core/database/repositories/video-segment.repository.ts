/**
 * 视频片段仓库（tasks/2026-09-04-ep-video-segment-redesign §4）
 * @module database/repositories/video-segment.repository
 * @description 基于 TypeORM + BaseRepository（user_id scoped）。片段是制作/生成最小单元。
 */

import type { DataSource } from 'typeorm'
import { IsNull } from 'typeorm'
import { EpVideoSegmentEntity } from '../entities/episode-production/video-segment.entity'
import { BaseRepository } from '../base-repository'

export type EpVideoSegmentStatus =
  | 'pending'
  | 'generating'
  | 'completed'
  | 'error'
  /** 分镜被 cogen/重拆替换后，关联分镜已全删的旧片段（保留行与 video_path 可追溯，不参与合成/导出） */
  | 'superseded'

export interface EpVideoSegment {
  id: string
  episodeId: string
  sceneId: string
  seq: number
  status: EpVideoSegmentStatus
  shotCount: number
  estDuration: number | null
  prompt: string | null
  videoPath: string | null
  videoMode: 'text2video' | 'image2video' | 'keyframes2video' | null
  duration: number | null
  providerId: string | null
  modelId: string | null
  providerTaskId: string | null
  error: string | null
  createdAt: number
  updatedAt: number
}

export interface CreateVideoSegmentRequest {
  episodeId: string
  sceneId: string
  seq: number
  shotCount: number
  estDuration?: number | null
  prompt?: string | null
  status?: EpVideoSegmentStatus
}

export interface UpdateVideoSegmentRequest {
  status?: EpVideoSegmentStatus
  /** 手动分段（merge/split）后的 seq 重排 */
  seq?: number
  prompt?: string | null
  videoPath?: string | null
  videoMode?: 'text2video' | 'image2video' | 'keyframes2video' | null
  duration?: number | null
  providerId?: string | null
  modelId?: string | null
  providerTaskId?: string | null
  error?: string | null
  shotCount?: number
  estDuration?: number | null
}

export class EpVideoSegmentRepository extends BaseRepository<
  EpVideoSegmentEntity,
  EpVideoSegment
> {
  constructor(dataSource: DataSource) {
    super(dataSource, EpVideoSegmentEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: EpVideoSegmentEntity): EpVideoSegment {
    return {
      id: e.id,
      episodeId: e.episodeId,
      sceneId: e.sceneId,
      seq: e.seq,
      status: e.status as EpVideoSegmentStatus,
      shotCount: e.shotCount,
      estDuration: e.estDuration,
      prompt: e.prompt,
      videoPath: e.videoPath,
      videoMode: e.videoMode,
      duration: e.duration,
      providerId: e.providerId,
      modelId: e.modelId,
      providerTaskId: e.providerTaskId,
      error: e.error,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  /** 列出剧集全部片段（按 seq 升序，未逻辑删除） */
  async listByEpisode(episodeId: string): Promise<EpVideoSegment[]> {
    const entities = await this.scoped.find({
      where: { episodeId, deletedAt: IsNull() } as any,
      order: { seq: 'ASC' },
    })
    return this.toDtoList(entities)
  }

  async getById(id: string): Promise<EpVideoSegment | null> {
    const e = await this.scoped.findOne({ id, deletedAt: IsNull() } as any)
    return e ? this.toDto(e) : null
  }

  async create(data: CreateVideoSegmentRequest): Promise<EpVideoSegment> {
    const now = new Date()
    const entity = this.repo.create({
      id: this.generateId(),
      episodeId: data.episodeId,
      sceneId: data.sceneId,
      seq: data.seq,
      status: data.status ?? 'pending',
      shotCount: data.shotCount,
      estDuration: data.estDuration ?? null,
      prompt: data.prompt ?? null,
      videoPath: null,
      videoMode: null,
      duration: null,
      providerId: null,
      modelId: null,
      providerTaskId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: UpdateVideoSegmentRequest,
  ): Promise<EpVideoSegment | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.status !== undefined) { existing.status = data.status; changed = true }
    if (data.seq !== undefined) { existing.seq = data.seq; changed = true }
    if (data.prompt !== undefined) { existing.prompt = data.prompt ?? null; changed = true }
    if (data.videoPath !== undefined) { existing.videoPath = data.videoPath ?? null; changed = true }
    if (data.videoMode !== undefined) { existing.videoMode = data.videoMode ?? null; changed = true }
    if (data.duration !== undefined) { existing.duration = data.duration ?? null; changed = true }
    if (data.providerId !== undefined) { existing.providerId = data.providerId ?? null; changed = true }
    if (data.modelId !== undefined) { existing.modelId = data.modelId ?? null; changed = true }
    if (data.providerTaskId !== undefined) { existing.providerTaskId = data.providerTaskId ?? null; changed = true }
    if (data.error !== undefined) { existing.error = data.error ?? null; changed = true }
    if (data.shotCount !== undefined) { existing.shotCount = data.shotCount; changed = true }
    if (data.estDuration !== undefined) { existing.estDuration = data.estDuration ?? null; changed = true }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  /** 物理删除（重新分段时清掉未生成的片段；completed 的不走这里） */
  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  private generateId(): string {
    return `evs_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
