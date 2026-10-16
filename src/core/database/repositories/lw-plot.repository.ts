/**
 * 情节仓库
 * @module database/repositories/lw-plot.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { IsNull } from 'typeorm'
import type { DataSource } from 'typeorm'
import { StoryPlot, CreatePlotRequest, UpdatePlotRequest } from '@shared/types/longwriting.types'
import { LwPlotEntity } from '../entities/lw-plot.entity'
import { LwPlotCharacterEntity } from '../entities/lw-plot-character.entity'
import { LwPlotCharacterRepository } from './lw-plot-character.repository'
import { LwPlotLocationRepository } from './lw-plot-location.repository'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export class LwPlotRepository extends BaseRepository<LwPlotEntity, StoryPlot> {
  private plotCharacterRepo: LwPlotCharacterRepository
  private plotLocationRepo: LwPlotLocationRepository

  constructor(dataSource: DataSource) {
    super(dataSource, LwPlotEntity)
    this.plotCharacterRepo = new LwPlotCharacterRepository(dataSource)
    this.plotLocationRepo = new LwPlotLocationRepository(dataSource)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: LwPlotEntity): StoryPlot {
    return {
      id: e.id,
      projectId: e.projectId,
      title: e.title,
      summary: e.summary,
      plotOrder: e.plotOrder,
      involvedCharacters: ((e.involvedCharacters as string[] | null) ?? []) as string[],
      involvedLocations: ((e.involvedLocations as string[] | null) ?? []) as string[],
      notes: e.notes ?? undefined,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  private isIdFormat(values: string[]): boolean {
    return values.some(v => v.startsWith('char_') || v.startsWith('loc_') || v.includes('-'))
  }

  async getByProjectId(projectId: string): Promise<StoryPlot[]> {
    const entities = await this.repo
      .createQueryBuilder('p')
      .where('p.project_id = :pid', { pid: projectId })
      .orderBy('p.plot_order', 'ASC')
      .addOrderBy('p.created_at', 'ASC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getById(id: string): Promise<StoryPlot | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(data: CreatePlotRequest): Promise<StoryPlot> {
    const id = this.generateId()
    const now = new Date()

    const maxRow = await this.repo
      .createQueryBuilder('p')
      .select('MAX(p.plot_order)', 'max')
      .where('p.project_id = :pid', { pid: data.projectId })
      .getRawOne()
    const maxVal = maxRow?.max
    const plotOrder = maxVal == null ? 0 : Number(maxVal) + 1

    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      title: data.title,
      summary: data.summary,
      plotOrder,
      involvedCharacters: data.involvedCharacters || [],
      involvedLocations: data.involvedLocations || [],
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)

    if (data.involvedCharacters?.length && this.isIdFormat(data.involvedCharacters)) {
      await this.plotCharacterRepo.batchAdd(id, data.involvedCharacters)
    }
    if (data.involvedLocations?.length && this.isIdFormat(data.involvedLocations)) {
      await this.plotLocationRepo.batchAdd(id, data.involvedLocations)
    }

    return this.toDto(saved)
  }

  async batchCreate(
    projectId: string,
    plots: { title: string; summary: string; involvedCharacters?: string[] }[],
  ): Promise<StoryPlot[]> {
    if (plots.length === 0) return []
    const now = new Date()
    // 事务回调内的裸 manager 仓储不会走 scoped 注入租户——必须在回调外同步捕获
    // userId 并显式落列（与 BaseRepository.scopeEntity 的口径一致：无 ALS → NULL）
    const userId = getCurrentUserId()
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwPlotEntity)
      const result: StoryPlot[] = []
      for (let i = 0; i < plots.length; i++) {
        const plot = plots[i]
        const id = this.generateId()
        const saved = await repo.save(
          repo.create({
            id,
            projectId,
            userId,
            title: plot.title,
            summary: plot.summary,
            plotOrder: i,
            involvedCharacters: plot.involvedCharacters || [],
            involvedLocations: [] as string[],
            notes: null,
            createdAt: now,
            updatedAt: now,
          }),
        )
        // 事务内直接用回调 manager 写桥表（评审修复：原经 plotCharacterRepo.batchAdd
        // 会再开事务，撞 SQLite 串行门"事务回调内禁止再次开启事务"）
        if (plot.involvedCharacters?.length && this.isIdFormat(plot.involvedCharacters)) {
          const bridgeRepo = manager.getRepository(LwPlotCharacterEntity)
          const bridgeNow = Date.now()
          for (const cid of plot.involvedCharacters) {
            await bridgeRepo.save(bridgeRepo.create({ id: this.generateId(), plotId: id, userId, characterId: cid, createdAt: bridgeNow }))
          }
        }
        result.push(this.toDto(saved))
      }
      return result
    })
  }

  async update(id: string, data: UpdatePlotRequest): Promise<StoryPlot | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.title !== undefined) { existing.title = data.title; changed = true }
    if (data.summary !== undefined) { existing.summary = data.summary; changed = true }
    if (data.plotOrder !== undefined) { existing.plotOrder = data.plotOrder; changed = true }
    if (data.involvedCharacters !== undefined) {
      existing.involvedCharacters = data.involvedCharacters
      changed = true
    }
    if (data.involvedLocations !== undefined) {
      existing.involvedLocations = data.involvedLocations
      changed = true
    }
    if (data.notes !== undefined) { existing.notes = data.notes ?? null; changed = true }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)

    if (data.involvedCharacters !== undefined && this.isIdFormat(data.involvedCharacters)) {
      await this.plotCharacterRepo.replaceAll(id, data.involvedCharacters)
    }
    if (data.involvedLocations !== undefined && this.isIdFormat(data.involvedLocations)) {
      await this.plotLocationRepo.replaceAll(id, data.involvedLocations)
    }

    return this.toDto(saved)
  }

  async reorderPlots(
    _projectId: string,
    orderList: { id: string; order: number }[],
  ): Promise<boolean> {
    if (orderList.length === 0) return true
    // 裸 manager update 不带租户过滤，按 id 直改可跨租户改序——复刻 scopeWhere 口径补 userId
    const userId = getCurrentUserId()
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwPlotEntity)
      for (const item of orderList) {
        await repo.update({ id: item.id, userId: userId === null ? IsNull() : userId } as any, {
          plotOrder: item.order,
          updatedAt: new Date(),
        })
      }
    })
    return true
  }

  async delete(id: string): Promise<boolean> {
    await this.plotCharacterRepo.deleteByPlotId(id)
    await this.plotLocationRepo.deleteByPlotId(id)
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByProjectId(projectId: string): Promise<boolean> {
    const plots = await this.scoped.find({ where: { projectId } as any, select: ['id'] })
    for (const p of plots) {
      await this.plotCharacterRepo.deleteByPlotId(p.id)
      await this.plotLocationRepo.deleteByPlotId(p.id)
    }
    const affected = await this.scoped.delete({ projectId } as any)
    return affected > 0
  }

  async countByProjectId(projectId: string): Promise<number> {
    return this.scoped.count({ projectId } as any)
  }

  async getCharacterIds(plotId: string): Promise<string[]> {
    return this.plotCharacterRepo.getCharacterIdsByPlotId(plotId)
  }

  async getLocationIds(plotId: string): Promise<string[]> {
    return this.plotLocationRepo.getLocationIdsByPlotId(plotId)
  }

  async updateCharacterRelations(
    plotId: string,
    characterIds: string[],
  ): Promise<void> {
    await this.plotCharacterRepo.replaceAll(plotId, characterIds)
  }

  async updateLocationRelations(
    plotId: string,
    locationIds: string[],
  ): Promise<void> {
    await this.plotLocationRepo.replaceAll(plotId, locationIds)
  }

  async migrateToRelationTables(
    projectId: string,
  ): Promise<{ characters: number; locations: number }> {
    const characters = await this.plotCharacterRepo.migrateFromJson(projectId)
    const locations = await this.plotLocationRepo.migrateFromJson(projectId)
    return { characters, locations }
  }

  private generateId(): string {
    return `plot_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
