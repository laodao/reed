/**
 * 长文写作项目仓库
 * @module database/repositories/lw-project.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  LongWritingProject,
  CreateProjectRequest,
  UpdateProjectRequest,
  WizardStateFull,
} from '@shared/types/longwriting.types'
import { LwProjectEntity } from '../entities/lw-project.entity'
import { BaseRepository } from '../base-repository'

export class LwProjectRepository extends BaseRepository<
  LwProjectEntity,
  LongWritingProject
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwProjectEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: LwProjectEntity): LongWritingProject {
    return {
      id: e.id,
      name: e.name,
      type: e.type as LongWritingProject['type'],
      stage: e.stage as LongWritingProject['stage'],
      progress: e.progress,
      wizardState: this.parseWizardState(e.wizardState),
      coverPath: e.coverPath ?? null,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  /** 放行完整 JSON（旧向导 {skipped} + 研讨室 room 子键——v2.1） */
  private parseWizardState(jsonStr: string | null): WizardStateFull | undefined {
    if (!jsonStr) return undefined
    try {
      const data = JSON.parse(jsonStr)
      if (data && typeof data === 'object' && !Array.isArray(data)) return data
      return undefined
    } catch {
      return undefined
    }
  }

  async getAll(): Promise<LongWritingProject[]> {
    return this.findManyByWhere({} as any, { createdAt: 'DESC' })
  }

  async getById(id: string): Promise<LongWritingProject | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getByType(
    type: 'story' | 'comment',
  ): Promise<LongWritingProject[]> {
    return this.findManyByWhere({ type } as any, { createdAt: 'DESC' })
  }

  async create(data: CreateProjectRequest): Promise<LongWritingProject> {
    const id = this.generateId()
    const now = new Date()
    const initialStage = data.type === 'story' ? 'overview' : 'topic'
    const entity = this.repo.create({
      id,
      name: data.name,
      type: data.type,
      stage: initialStage,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: UpdateProjectRequest,
  ): Promise<LongWritingProject | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.name !== undefined) { existing.name = data.name; changed = true }
    if (data.stage !== undefined) { existing.stage = data.stage; changed = true }
    if (data.progress !== undefined) { existing.progress = data.progress; changed = true }
    if (data.wizardState !== undefined) {
      existing.wizardState = JSON.stringify(data.wizardState)
      changed = true
    }
    if (data.coverPath !== undefined) { existing.coverPath = data.coverPath; changed = true }

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
    return `lw_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
