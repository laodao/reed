/**
 * 时代背景仓库
 * @module database/repositories/lw-background.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import { StoryBackground, EraType } from '@shared/types/longwriting.types'
import { LwBackgroundEntity } from '../entities/lw-background.entity'
import { BaseRepository } from '../base-repository'

export class LwBackgroundRepository extends BaseRepository<
  LwBackgroundEntity,
  StoryBackground
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwBackgroundEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: LwBackgroundEntity): StoryBackground {
    return {
      id: e.id,
      projectId: e.projectId,
      eraType: (e.eraType as EraType) || 'ancient',
      eraDescription: e.eraDescription ?? '',
      socialStructure: e.socialStructure ?? '',
      techLevel: e.techLevel ?? '',
      specialRules: e.specialRules ?? '',
      factionDistribution: e.factionDistribution ?? '',
      geographicOrientation: e.geographicOrientation ?? '',
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async getByProjectId(projectId: string): Promise<StoryBackground | null> {
    return this.findOneByWhere({ projectId } as any)
  }

  async getById(id: string): Promise<StoryBackground | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(projectId: string): Promise<StoryBackground> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      projectId,
      eraType: 'ancient',
      eraDescription: '',
      socialStructure: '',
      techLevel: '',
      specialRules: '',
      factionDistribution: '',
      geographicOrientation: '',
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: Partial<StoryBackground>,
  ): Promise<StoryBackground | null> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return null

    let changed = false
    if (data.eraType !== undefined) { existing.eraType = data.eraType; changed = true }
    if (data.eraDescription !== undefined) { existing.eraDescription = data.eraDescription; changed = true }
    if (data.socialStructure !== undefined) { existing.socialStructure = data.socialStructure; changed = true }
    if (data.techLevel !== undefined) { existing.techLevel = data.techLevel; changed = true }
    if (data.specialRules !== undefined) { existing.specialRules = data.specialRules; changed = true }
    if (data.factionDistribution !== undefined) { existing.factionDistribution = data.factionDistribution; changed = true }
    if (data.geographicOrientation !== undefined) { existing.geographicOrientation = data.geographicOrientation; changed = true }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.repo.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  private generateId(): string {
    return `bg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
