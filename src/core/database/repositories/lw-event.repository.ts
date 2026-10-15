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
      state: (e.state as StoryEvent['state']) ?? 'happened',
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
      state: data.state ?? 'happened',
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
    if (data.state !== undefined) existing.state = data.state ?? 'happened'

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

  /** 查本章事件（章节图谱"重跑=重建"时先取旧事件 id 以级联删边） */
  async listByChapter(projectId: string, chapterNumber: number): Promise<StoryEvent[]> {
    return this.scoped.find({ projectId, chapterNumber } as any)
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    return this.scoped.delete({ projectId } as any)
  }

  async countByProjectId(projectId: string): Promise<number> {
    return this.scoped.count({ projectId } as any)
  }

  /**
   * 从项目全部事件的 involved_entities JSON 中剔除指定实体（悬空引用治理）。
   * 实体删除路径调用（purge 级联）：引用残留在事件 JSON 里会让 getGraph 推导出
   * 指向不存在节点的 involves 边。返回被改写的事件行数。
   */
  async removeEntityFromInvolved(projectId: string, entityType: string, entityId: string): Promise<number> {
    const rows = await this.scoped.find({ projectId } as any)
    let changed = 0
    for (const row of rows) {
      if (!row.involvedEntities) continue
      let ents: Array<{ type?: string; id?: string }>
      try {
        ents = JSON.parse(row.involvedEntities)
      } catch {
        continue
      }
      if (!Array.isArray(ents)) continue
      const filtered = ents.filter(e => !(e?.type === entityType && e?.id === entityId))
      if (filtered.length === ents.length) continue
      row.involvedEntities = filtered.length > 0 ? JSON.stringify(filtered) : null
      row.updatedAt = Date.now()
      await this.scoped.save(row)
      changed++
    }
    return changed
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
