/**
 * 故事概要仓库
 * @module database/repositories/lw-story-overview.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import { StoryOverview } from '@shared/types/longwriting.types'
import { LwStoryOverviewEntity } from '../entities/lw-story-overview.entity'
import { BaseRepository } from '../base-repository'

export class LwStoryOverviewRepository extends BaseRepository<
  LwStoryOverviewEntity,
  StoryOverview
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwStoryOverviewEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: LwStoryOverviewEntity): StoryOverview {
    return {
      id: e.id,
      projectId: e.projectId,
      storyType: (e.storyType as StoryOverview['storyType']) || 'other',
      title: e.title || '',
      coreIdea: e.coreIdea || '',
      style: e.style || undefined,
      targetReader: e.targetReader || undefined,
      estimatedLength: e.estimatedLength || undefined,
      otherRequirements: e.otherRequirements || undefined,
      summary: e.summary || '',
      coreConflict: e.coreConflict || '',
      keyCharacters: ((e.keyCharacters as string[] | null) ?? []) as string[],
      keyLocations: ((e.keyLocations as string[] | null) ?? []) as string[],
      estimatedChapters: e.estimatedChapters || 0,
      enabledFeatures: ((e.enabledFeatures as string[] | null) ?? []) as string[],
      isLocked: e.isLocked === 1,
      isSaved: e.isSaved === 1,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    } as StoryOverview
  }

  async getByProjectId(projectId: string): Promise<StoryOverview | null> {
    return this.findOneByWhere({ projectId } as any)
  }

  async getById(id: string): Promise<StoryOverview | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(projectId: string): Promise<StoryOverview> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      projectId,
      storyType: null,
      title: null,
      summary: null,
      coreConflict: null,
      theme: null,
      estimatedChapters: null,
      isLocked: 0,
      coreIdea: null,
      style: null,
      targetReader: null,
      estimatedLength: null,
      otherRequirements: null,
      keyCharacters: [] as string[],
      keyLocations: [] as string[],
      isSaved: 0,
      enabledFeatures: [] as string[],
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: Partial<StoryOverview>,
  ): Promise<StoryOverview | null> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return null

    let changed = false
    if (data.storyType !== undefined) { existing.storyType = data.storyType ?? null; changed = true }
    if (data.title !== undefined) { existing.title = data.title ?? null; changed = true }
    if (data.coreIdea !== undefined) { existing.coreIdea = data.coreIdea ?? null; changed = true }
    if (data.style !== undefined) { existing.style = data.style ?? null; changed = true }
    if (data.targetReader !== undefined) { existing.targetReader = data.targetReader ?? null; changed = true }
    if (data.estimatedLength !== undefined) { existing.estimatedLength = data.estimatedLength ?? null; changed = true }
    if (data.otherRequirements !== undefined) { existing.otherRequirements = data.otherRequirements ?? null; changed = true }
    if (data.summary !== undefined) { existing.summary = data.summary ?? null; changed = true }
    if (data.coreConflict !== undefined) { existing.coreConflict = data.coreConflict ?? null; changed = true }
    if (data.keyCharacters !== undefined) { existing.keyCharacters = data.keyCharacters ?? []; changed = true }
    if (data.keyLocations !== undefined) { existing.keyLocations = data.keyLocations ?? []; changed = true }
    if (data.estimatedChapters !== undefined) { existing.estimatedChapters = data.estimatedChapters ?? null; changed = true }
    if (data.enabledFeatures !== undefined) { existing.enabledFeatures = data.enabledFeatures ?? []; changed = true }
    if (data.isLocked !== undefined) { existing.isLocked = data.isLocked ? 1 : 0; changed = true }
    if (data.isSaved !== undefined) { existing.isSaved = data.isSaved ? 1 : 0; changed = true }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.repo.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async setLocked(id: string, locked: boolean): Promise<boolean> {
    const result = await this.repo.update({ id } as any, {
      isLocked: locked ? 1 : 0,
      updatedAt: new Date(),
    })
    return (result.affected ?? 0) > 0
  }

  private generateId(): string {
    return `overview_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
