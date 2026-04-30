/**
 * 情节地点关联仓库
 * @module database/repositories/lw-plot-location.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, type DataSource } from 'typeorm'
import { LwPlotLocationEntity } from '../entities/lw-plot-location.entity'
import { LwPlotEntity } from '../entities/lw-plot.entity'
import { LwLocationEntity } from '../entities/lw-location.entity'
import { BaseRepository } from '../base-repository'

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
    const rows = await this.repo.find({ where: { plotId } as any, select: ['locationId'] })
    return rows.map(r => r.locationId)
  }

  async getPlotIdsByLocationId(locationId: string): Promise<string[]> {
    const rows = await this.repo.find({ where: { locationId } as any, select: ['plotId'] })
    return rows.map(r => r.plotId)
  }

  async getLocationIdsByPlotIds(plotIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (plotIds.length === 0) return result
    const rows = await this.repo.find({
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
    const existing = await this.repo.findOne({ where: { plotId, locationId } as any })
    if (existing) return this.toDto(existing)
    const saved = await this.repo.save(this.repo.create({ id, plotId, locationId, createdAt: now }))
    return this.toDto(saved)
  }

  async batchAdd(plotId: string, locationIds: string[]): Promise<void> {
    if (locationIds.length === 0) return
    await this.dataSource.transaction(async () => {
      for (const lid of locationIds) await this.add(plotId, lid)
    })
  }

  async replaceAll(plotId: string, locationIds: string[]): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwPlotLocationEntity)
      await repo.delete({ plotId } as any)
      const now = Date.now()
      for (const lid of locationIds) {
        await repo.save(repo.create({ id: this.generateId(), plotId, locationId: lid, createdAt: now }))
      }
    })
  }

  async delete(plotId: string, locationId: string): Promise<boolean> {
    const result = await this.repo.delete({ plotId, locationId } as any)
    return (result.affected ?? 0) > 0
  }

  async deleteByPlotId(plotId: string): Promise<number> {
    const result = await this.repo.delete({ plotId } as any)
    return result.affected ?? 0
  }

  async deleteByLocationId(locationId: string): Promise<number> {
    const result = await this.repo.delete({ locationId } as any)
    return result.affected ?? 0
  }

  async migrateFromJson(projectId: string): Promise<number> {
    const plotRepo = this.dataSource.getRepository(LwPlotEntity)
    const locRepo = this.dataSource.getRepository(LwLocationEntity)
    const plots = await plotRepo.find({ where: { projectId } as any, select: ['id', 'involvedLocations'] })
    const locs = await locRepo.find({ where: { projectId } as any, select: ['id', 'name'] })
    const nameToId = new Map<string, string>()
    for (const l of locs) nameToId.set(l.name, l.id)

    let migrated = 0
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
            await repo.save(repo.create({ id: this.generateId(), plotId: plot.id, locationId: lid, createdAt: now }))
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
