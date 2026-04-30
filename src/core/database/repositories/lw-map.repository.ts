/**
 * 地图仓库
 * @module database/repositories/lw-map.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import { StoryMap, MapOrientation, MapGeneratedData } from '@shared/types/longwriting.types'
import { LwMapEntity } from '../entities/lw-map.entity'
import { BaseRepository } from '../base-repository'

export class LwMapRepository extends BaseRepository<LwMapEntity, StoryMap> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwMapEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  private parseAiData(raw: string | null): MapGeneratedData | undefined {
    if (!raw) return undefined
    try {
      return JSON.parse(raw) as MapGeneratedData
    } catch {
      return undefined
    }
  }

  protected toDto(e: LwMapEntity): StoryMap {
    return {
      id: e.id,
      projectId: e.projectId,
      name: e.name,
      orientation: (e.orientation as MapOrientation) || 'other',
      characteristics: e.characteristics ?? '',
      imagePath: e.imagePath ?? undefined,
      aiGeneratedData: this.parseAiData(e.aiGeneratedData),
      sortOrder: e.sortOrder,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    } as StoryMap
  }

  async getByProjectId(projectId: string): Promise<StoryMap[]> {
    const entities = await this.repo
      .createQueryBuilder('m')
      .where('m.project_id = :pid', { pid: projectId })
      .orderBy('m.sort_order', 'ASC')
      .addOrderBy('m.created_at', 'DESC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getById(id: string): Promise<StoryMap | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(data: {
    projectId: string
    name: string
    orientation?: MapOrientation
    characteristics?: string
    sortOrder?: number
  }): Promise<StoryMap> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      name: data.name,
      orientation: data.orientation || 'other',
      characteristics: data.characteristics || '',
      imagePath: null,
      aiGeneratedData: null,
      sortOrder: data.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async update(id: string, data: Partial<StoryMap>): Promise<StoryMap | null> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return null

    let changed = false
    if (data.name !== undefined) { existing.name = data.name; changed = true }
    if (data.orientation !== undefined) { existing.orientation = data.orientation; changed = true }
    if (data.characteristics !== undefined) { existing.characteristics = data.characteristics; changed = true }
    if (data.imagePath !== undefined) { existing.imagePath = data.imagePath ?? null; changed = true }
    if (data.aiGeneratedData !== undefined) {
      existing.aiGeneratedData = data.aiGeneratedData ? JSON.stringify(data.aiGeneratedData) : null
      changed = true
    }
    if (data.sortOrder !== undefined) { existing.sortOrder = data.sortOrder; changed = true }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.repo.save(existing)
    return this.toDto(saved)
  }

  async updateImagePath(
    id: string,
    imagePath: string | null,
  ): Promise<boolean> {
    const result = await this.repo.update({ id } as any, {
      imagePath,
      updatedAt: new Date(),
    })
    return (result.affected ?? 0) > 0
  }

  async updateAIGeneratedData(
    id: string,
    data: MapGeneratedData | null,
  ): Promise<boolean> {
    const result = await this.repo.update({ id } as any, {
      aiGeneratedData: data ? JSON.stringify(data) : null,
      updatedAt: new Date(),
    })
    return (result.affected ?? 0) > 0
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async updateSortOrder(
    orderList: { id: string; order: number }[],
  ): Promise<boolean> {
    if (orderList.length === 0) return true
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwMapEntity)
      for (const item of orderList) {
        await repo.update({ id: item.id } as any, {
          sortOrder: item.order,
          updatedAt: new Date(),
        })
      }
    })
    return true
  }

  private generateId(): string {
    return `map_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
