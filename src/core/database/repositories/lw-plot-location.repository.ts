/**
 * 情节地点关联仓库
 * @module database/repositories/lw-plot-location.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, IsNull } from 'typeorm'
import type { DataSource } from 'typeorm'
import { LwPlotLocationEntity } from '../entities/lw-plot-location.entity'
import { LwPlotEntity } from '../entities/lw-plot.entity'
import { LwLocationEntity } from '../entities/lw-location.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface PlotLocationRelation {
  id: string
  plotId: string
  locationId: string
  createdAt: number
}

export class LwPlotLocationRepository extends BaseRepository<
  LwPlotLocationEntity,
  PlotLocationRelation
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwPlotLocationEntity)
  }

  protected toDto(e: LwPlotLocationEntity): PlotLocationRelation {
    return { id: e.id, plotId: e.plotId, locationId: e.locationId, createdAt: e.createdAt }
  }

  async getLocationIdsByPlotId(plotId: string): Promise<string[]> {
    const rows = await this.scoped.find({ where: { plotId } as any, select: ['locationId'] })
    return rows.map(r => r.locationId)
  }

  async getPlotIdsByLocationId(locationId: string): Promise<string[]> {
    const rows = await this.scoped.find({ where: { locationId } as any, select: ['plotId'] })
    return rows.map(r => r.plotId)
  }

  async getLocationIdsByPlotIds(plotIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (plotIds.length === 0) return result
    const rows = await this.scoped.find({
      where: { plotId: In(plotIds) } as any,
      select: ['plotId', 'locationId'],
    })
    for (const row of rows) {
      if (!result.has(row.plotId)) result.set(row.plotId, [])
      result.get(row.plotId)!.push(row.locationId)
    }
    for (const id of plotIds) if (!result.has(id)) result.set(id, [])
    return result
  }

  async add(plotId: string, locationId: string): Promise<PlotLocationRelation> {
    const id = this.generateId()
    const now = Date.now()
    const existing = await this.scoped.findOne({ plotId, locationId } as any)
    if (existing) return this.toDto(existing)
    const saved = await this.scoped.save({ id, plotId, locationId, createdAt: now })
    return this.toDto(saved)
  }

  async batchAdd(plotId: string, locationIds: string[]): Promise<void> {
    if (locationIds.length === 0) return
    await this.dataSource.transaction(async () => {
      for (const lid of locationIds) await this.add(plotId, lid)
    })
  }

  async replaceAll(plotId: string, locationIds: string[]): Promise<void> {
    // 事务回调内的裸 manager 仓储不走 scoped 注入——事务外同步捕获 userId，
    // 写入显式落列、删除显式过滤（口径与 base-repository 的 scopeWhere/scopeEntity 一致）
    const userId = getCurrentUserId()
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwPlotLocationEntity)
      await repo.delete({ plotId, userId: userId === null ? IsNull() : userId } as any)
      const now = Date.now()
      for (const lid of locationIds) {
        await repo.save(repo.create({ id: this.generateId(), plotId, userId, locationId: lid, createdAt: now }))
      }
    })
  }

  async delete(plotId: string, locationId: string): Promise<boolean> {
    const affected = await this.scoped.delete({ plotId, locationId } as any)
    return affected > 0
  }

  async deleteByPlotId(plotId: string): Promise<number> {
    return this.scoped.delete({ plotId } as any)
  }

  async deleteByLocationId(locationId: string): Promise<number> {
    return this.scoped.delete({ locationId } as any)
  }

  async migrateFromJson(projectId: string): Promise<number> {
    const plotRepo = this.dataSource.getRepository(LwPlotEntity)
    const locRepo = this.dataSource.getRepository(LwLocationEntity)
    const plots = await plotRepo.find({ where: { projectId } as any, select: ['id', 'involvedLocations'] })
    const locs = await locRepo.find({ where: { projectId } as any, select: ['id', 'name'] })
    const nameToId = new Map<string, string>()
    for (const l of locs) nameToId.set(l.name, l.id)

    let migrated = 0
    const userId = getCurrentUserId()
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwPlotLocationEntity)
      const now = Date.now()
      for (const plot of plots) {
        const names = (plot.involvedLocations as string[] | null) ?? []
        for (const name of names) {
          const lid = nameToId.get(name)
          if (!lid) continue
          const existing = await repo.findOne({ where: { plotId: plot.id, locationId: lid } as any })
          if (!existing) {
            await repo.save(repo.create({ id: this.generateId(), plotId: plot.id, userId, locationId: lid, createdAt: now }))
            migrated++
          }
        }
      }
    })
    return migrated
  }

  private generateId(): string {
    return `pl_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
