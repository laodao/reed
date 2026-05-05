/**
 * 分镜关键帧仓库（spec §4.2 / §4.7 · P5-T3）
 * @module database/repositories/storyboard-keyframe.repository
 * @description 基于 TypeORM 实现。一个 storyboard 含 N 张 keyframe（2~9 张）。
 *              spec §4.3 关键帧顺序：start → end → middle，frameRole + frameIndex 双字段约束顺序。
 */

import type { DataSource } from 'typeorm'
import { StoryboardKeyframeEntity } from '../entities/episode-production/storyboard-keyframe.entity'
import { BaseRepository } from '../base-repository'

export type KeyframeRole = 'start' | 'middle' | 'end' | 'extra'

/** keyframe DTO（不引入 shared types 避免循环；entity 字段已稳定）*/
export interface StoryboardKeyframe {
  id: string
  storyboardId: string
  frameIndex: number
  timePercent: number
  frameRole: KeyframeRole
  imageAssetId: string | null
  derivedFromKeyframeId: string | null
  prompt: string | null
  negativePrompt: string | null
  createdAt: number
  updatedAt: number
}

export interface CreateKeyframeRequest {
  storyboardId: string
  frameIndex: number
  timePercent?: number
  frameRole: KeyframeRole
  imageAssetId?: string | null
  derivedFromKeyframeId?: string | null
  prompt?: string | null
  negativePrompt?: string | null
}

export interface UpdateKeyframeRequest {
  imageAssetId?: string | null
  derivedFromKeyframeId?: string | null
  prompt?: string | null
  negativePrompt?: string | null
  timePercent?: number
  frameRole?: KeyframeRole
}

export class StoryboardKeyframeRepository extends BaseRepository<
  StoryboardKeyframeEntity,
  StoryboardKeyframe
> {
  constructor(dataSource: DataSource) {
    super(dataSource, StoryboardKeyframeEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: StoryboardKeyframeEntity): StoryboardKeyframe {
    return {
      id: e.id,
      storyboardId: e.storyboardId,
      frameIndex: e.frameIndex,
      timePercent: e.timePercent,
      frameRole: e.frameRole,
      imageAssetId: e.imageAssetId,
      derivedFromKeyframeId: e.derivedFromKeyframeId,
      prompt: e.prompt,
      negativePrompt: e.negativePrompt,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  /** 列出某分镜的全部关键帧（按 frame_index 升序）*/
  async listByStoryboard(storyboardId: string): Promise<StoryboardKeyframe[]> {
    return this.findManyByWhere(
      { storyboardId } as any,
      { frameIndex: 'ASC' },
    )
  }

  async getById(id: string): Promise<StoryboardKeyframe | null> {
    return this.findOneByWhere({ id } as any)
  }

  /** 创建一帧。frameIndex / frameRole 由调用方决定（service 层负责生成顺序策略） */
  async create(data: CreateKeyframeRequest): Promise<StoryboardKeyframe> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      storyboardId: data.storyboardId,
      frameIndex: data.frameIndex,
      timePercent: data.timePercent ?? this.defaultTimePercent(data.frameRole),
      frameRole: data.frameRole,
      imageAssetId: data.imageAssetId ?? null,
      derivedFromKeyframeId: data.derivedFromKeyframeId ?? null,
      prompt: data.prompt ?? null,
      negativePrompt: data.negativePrompt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  /** 批量创建（事务）*/
  async createMany(
    requests: CreateKeyframeRequest[],
  ): Promise<StoryboardKeyframe[]> {
    if (requests.length === 0) return []
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StoryboardKeyframeEntity)
      const result: StoryboardKeyframe[] = []
      const now = new Date()
      for (const data of requests) {
        const id = this.generateId()
        const saved = await repo.save(
          repo.create({
            id,
            storyboardId: data.storyboardId,
            frameIndex: data.frameIndex,
            timePercent: data.timePercent ?? this.defaultTimePercent(data.frameRole),
            frameRole: data.frameRole,
            imageAssetId: data.imageAssetId ?? null,
            derivedFromKeyframeId: data.derivedFromKeyframeId ?? null,
            prompt: data.prompt ?? null,
            negativePrompt: data.negativePrompt ?? null,
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
    data: UpdateKeyframeRequest,
  ): Promise<StoryboardKeyframe | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.imageAssetId !== undefined) {
      existing.imageAssetId = data.imageAssetId ?? null
      changed = true
    }
    if (data.derivedFromKeyframeId !== undefined) {
      existing.derivedFromKeyframeId = data.derivedFromKeyframeId ?? null
      changed = true
    }
    if (data.prompt !== undefined) {
      existing.prompt = data.prompt ?? null
      changed = true
    }
    if (data.negativePrompt !== undefined) {
      existing.negativePrompt = data.negativePrompt ?? null
      changed = true
    }
    if (data.timePercent !== undefined) {
      existing.timePercent = data.timePercent
      changed = true
    }
    if (data.frameRole !== undefined) {
      existing.frameRole = data.frameRole
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

  /** 删除某分镜的全部关键帧（重新生成时使用）*/
  async deleteByStoryboard(storyboardId: string): Promise<number> {
    return this.scoped.delete({ storyboardId } as any)
  }

  private generateId(): string {
    return `kf_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  /** spec §4.2：start=0, end=1, middle 取中位 */
  private defaultTimePercent(role: KeyframeRole): number {
    if (role === 'start') return 0
    if (role === 'end') return 1
    if (role === 'middle') return 0.5
    return 0.5 // extra
  }
}
