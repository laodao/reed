/**
 * 剧集项目仓库
 * @module database/repositories/video-project.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  VideoProject,
  VideoProjectConfig,
} from '@shared/types/story-to-video.types'
import { VideoProjectEntity } from '../entities/episode-production/video-project.entity'
import { BaseRepository } from '../base-repository'

export interface CreateVideoProjectRequest {
  name: string
  longWritingProjectId?: string
  config: VideoProjectConfig
}

export interface UpdateVideoProjectRequest {
  name?: string
  status?: VideoProject['status']
  config?: VideoProjectConfig
  longWritingProjectId?: string
}

export class VideoProjectRepository extends BaseRepository<
  VideoProjectEntity,
  VideoProject
> {
  constructor(dataSource: DataSource) {
    super(dataSource, VideoProjectEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: VideoProjectEntity): VideoProject {
    return {
      id: e.id,
      name: e.name,
      longWritingProjectId: e.longWritingProjectId || undefined,
      status: e.status as VideoProject['status'],
      config: e.config as VideoProjectConfig,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async getAll(): Promise<VideoProject[]> {
    return this.findManyByWhere({} as any, { createdAt: 'DESC' })
  }

  async getByLongWritingProjectId(
    longWritingProjectId: string,
  ): Promise<VideoProject[]> {
    return this.findManyByWhere(
      { longWritingProjectId } as any,
      { createdAt: 'DESC' },
    )
  }

  async getById(id: string): Promise<VideoProject | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(data: CreateVideoProjectRequest): Promise<VideoProject> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      name: data.name,
      longWritingProjectId: data.longWritingProjectId ?? null,
      status: 'draft',
      config: data.config as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: UpdateVideoProjectRequest,
  ): Promise<VideoProject | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.name !== undefined) { existing.name = data.name; changed = true }
    if (data.status !== undefined) { existing.status = data.status; changed = true }
    if (data.config !== undefined) {
      existing.config = data.config as Record<string, unknown>
      changed = true
    }
    if (data.longWritingProjectId !== undefined) {
      // 外键约束要求：空字符串转为 null，否则会触发 FOREIGN KEY constraint failed
      // 因为 lw_projects 表不存在 id='' 的记录
      existing.longWritingProjectId = data.longWritingProjectId || null
      changed = true
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

  async exists(id: string): Promise<boolean> {
    return this.existsByWhere({ id } as any)
  }

  private generateId(): string {
    return `vp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
