/**
 * 长文写作故事事件仓库
 * @module database/repositories/lw-event.repository
 * @description 基于 TypeORM 实现，全部读写走 this.scoped.*（user_id 多租户隔离）。
 */

import type { DataSource } from 'typeorm'
import type {
  StoryEvent,
  CreateStoryEventRequest,
  UpdateStoryEventRequest,
} from '@shared/types/longwriting.types'
import { LwEventEntity } from '../entities/lw-event.entity'
import { BaseRepository } from '../base-repository'
import { randomUUID } from 'crypto'

export class LwEventRepository extends BaseRepository<LwEventEntity, StoryEvent> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwEventEntity)
  }

  protected toDto(e: LwEventEntity): StoryEvent {
    return {
      id: e.id,
      projectId: e.projectId,
      name: e.name,
      description: e.description ?? undefined,
      chapterNumber: e.chapterNumber,
      storyTime: e.storyTime ?? undefined,
      involvedEntities: this.parseJson<StoryEvent['involvedEntities']>(e.involvedEntities),
      stateBefore: e.stateBefore ?? undefined,
      stateAfter: e.stateAfter ?? undefined,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async getByProjectId(projectId: string): Promise<StoryEvent[]> {
    const rows = await this.scoped.find({
      where: { projectId } as any,
      order: { chapterNumber: 'ASC' as const, createdAt: 'ASC' as const },
    })
    return this.toDtoList(rows)
  }

  async getByChapter(projectId: string, chapterNumber: number): Promise<StoryEvent[]> {
    const rows = await this.scoped.find({
      where: { projectId, chapterNumber } as any,
      order: { createdAt: 'ASC' as const },
    })
    return this.toDtoList(rows)
  }

  async getById(id: string): Promise<StoryEvent | null> {
    const e = await this.scoped.findOne({ id } as any)
    return e ? this.toDto(e) : null
  }

  async create(data: CreateStoryEventRequest): Promise<StoryEvent> {
    const id = randomUUID()
    const now = Date.now()
    const saved = await this.scoped.save({
      id,
      projectId: data.projectId,
      name: data.name,
      description: data.description ?? null,
      chapterNumber: data.chapterNumber,
      storyTime: data.storyTime ?? null,
      involvedEntities: data.involvedEntities ? JSON.stringify(data.involvedEntities) : null,
      stateBefore: data.stateBefore ?? null,
      stateAfter: data.stateAfter ?? null,
      createdAt: now,
      updatedAt: now,
    } as Partial<LwEventEntity>)
    return this.toDto(saved)
  }

  async batchCreate(dataList: CreateStoryEventRequest[]): Promise<StoryEvent[]> {
    if (dataList.length === 0) return []
    const results: StoryEvent[] = []
    for (const data of dataList) {
      results.push(await this.create(data))
    }
    return results
  }

  async update(id: string, data: UpdateStoryEventRequest): Promise<StoryEvent | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    if (data.name !== undefined) existing.name = data.name
    if (data.description !== undefined) existing.description = data.description ?? null
    if (data.storyTime !== undefined) existing.storyTime = data.storyTime ?? null
    if (data.involvedEntities !== undefined) {
      existing.involvedEntities = data.involvedEntities ? JSON.stringify(data.involvedEntities) : null
    }
    if (data.stateBefore !== undefined) existing.stateBefore = data.stateBefore ?? null
    if (data.stateAfter !== undefined) existing.stateAfter = data.stateAfter ?? null

    existing.updatedAt = Date.now()
    await this.scoped.save(existing)
    return this.toDto(existing)
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByChapter(projectId: string, chapterNumber: number): Promise<number> {
    return this.scoped.delete({ projectId, chapterNumber } as any)
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    return this.scoped.delete({ projectId } as any)
  }

  async countByProjectId(projectId: string): Promise<number> {
    return this.scoped.count({ projectId } as any)
  }

  private parseJson<T>(jsonStr: string | null): T | undefined {
    if (!jsonStr) return undefined
    try {
      return JSON.parse(jsonStr) as T
    } catch {
      return undefined
    }
  }
}
