/**
 * 章节状态摘要仓库
 * @module database/repositories/lw-chapter-state-summary.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  ChapterStateSummary,
  CreateChapterStateSummaryRequest,
} from '@shared/types/longwriting.types'
import { LwChapterStateSummaryEntity } from '../entities/lw-chapter-state-summary.entity'
import { BaseRepository } from '../base-repository'

export class LwChapterStateSummaryRepository extends BaseRepository<
  LwChapterStateSummaryEntity,
  ChapterStateSummary
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwChapterStateSummaryEntity)
  }

  protected toDto(e: LwChapterStateSummaryEntity): ChapterStateSummary {
    return {
      id: e.id,
      projectId: e.projectId,
      outlineId: e.outlineId,
      chapterNumber: e.chapterNumber,
      storyTime: e.storyTime,
      currentLocation: e.currentLocation ?? '',
      characterStates: e.characterStates ?? '',
      pendingEvents: e.pendingEvents ?? '',
      keyChanges: e.keyChanges ?? '',
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async getByProjectId(projectId: string): Promise<ChapterStateSummary[]> {
    const rows = await this.repo
      .createQueryBuilder('s')
      .where('s.project_id = :pid', { pid: projectId })
      .orderBy('s.chapter_number', 'ASC')
      .getMany()
    return this.toDtoList(rows)
  }

  async getByOutlineId(outlineId: string): Promise<ChapterStateSummary | null> {
    return this.findOneByWhere({ outlineId } as any)
  }

  async getByChapterNumber(
    projectId: string,
    chapterNumber: number,
  ): Promise<ChapterStateSummary | null> {
    return this.findOneByWhere({ projectId, chapterNumber } as any)
  }

  async getLatestBeforeChapter(
    projectId: string,
    chapterNumber: number,
  ): Promise<ChapterStateSummary | null> {
    const row = await this.repo
      .createQueryBuilder('s')
      .where('s.project_id = :pid', { pid: projectId })
      .andWhere('s.chapter_number < :cn', { cn: chapterNumber })
      .orderBy('s.chapter_number', 'DESC')
      .limit(1)
      .getOne()
    return row ? this.toDto(row) : null
  }

  async getLatest(projectId: string): Promise<ChapterStateSummary | null> {
    const row = await this.repo
      .createQueryBuilder('s')
      .where('s.project_id = :pid', { pid: projectId })
      .orderBy('s.chapter_number', 'DESC')
      .limit(1)
      .getOne()
    return row ? this.toDto(row) : null
  }

  async getById(id: string): Promise<ChapterStateSummary | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(data: CreateChapterStateSummaryRequest): Promise<ChapterStateSummary> {
    const id = this.generateId()
    const now = Date.now()

    await this.scoped.save({
        id,
        projectId: data.projectId,
        outlineId: data.outlineId,
        chapterNumber: data.chapterNumber,
        storyTime: data.storyTime,
        currentLocation: data.currentLocation,
        characterStates: data.characterStates,
        pendingEvents: data.pendingEvents,
        keyChanges: data.keyChanges,
        createdAt: now,
        updatedAt: now,
      })

    return {
      id,
      projectId: data.projectId,
      outlineId: data.outlineId,
      chapterNumber: data.chapterNumber,
      storyTime: data.storyTime,
      currentLocation: data.currentLocation,
      characterStates: data.characterStates,
      pendingEvents: data.pendingEvents,
      keyChanges: data.keyChanges,
      createdAt: now,
      updatedAt: now,
    }
  }

  async upsert(data: CreateChapterStateSummaryRequest): Promise<ChapterStateSummary> {
    const existing = await this.scoped.findOne({ outlineId: data.outlineId } as any)
    if (existing) {
      existing.storyTime = data.storyTime
      existing.currentLocation = data.currentLocation
      existing.characterStates = data.characterStates
      existing.pendingEvents = data.pendingEvents
      existing.keyChanges = data.keyChanges
      existing.chapterNumber = data.chapterNumber
      existing.updatedAt = Date.now()
      await this.scoped.save(existing)
      return this.toDto(existing)
    }
    return this.create(data)
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByOutlineId(outlineId: string): Promise<boolean> {
    const affected = await this.scoped.delete({ outlineId } as any)
    return affected > 0
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    return this.scoped.delete({ projectId } as any)
  }

  private generateId(): string {
    return `ch_summary_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
