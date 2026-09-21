/**
 * 大纲地点关联仓库
 * @module database/repositories/lw-outline-location.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, type DataSource } from 'typeorm'
import { LwOutlineLocationEntity } from '../entities/lw-outline-location.entity'
import { LwOutlineEntity } from '../entities/lw-outline.entity'
import { LwLocationEntity } from '../entities/lw-location.entity'
import { BaseRepository } from '../base-repository'

export interface OutlineLocationRelation {
  id: string
  outlineId: string
  locationId: string
  createdAt: number
}

export class LwOutlineLocationRepository extends BaseRepository<
  LwOutlineLocationEntity,
  OutlineLocationRelation
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwOutlineLocationEntity)
  }

  protected toDto(e: LwOutlineLocationEntity): OutlineLocationRelation {
    return { id: e.id, outlineId: e.outlineId, locationId: e.locationId, createdAt: e.createdAt }
  }

  async getLocationIdsByOutlineId(outlineId: string): Promise<string[]> {
    const rows = await this.scoped.find({ where: { outlineId } as any, select: ['locationId'] })
    return rows.map(r => r.locationId)
  }

  async getOutlineIdsByLocationId(locationId: string): Promise<string[]> {
    const rows = await this.scoped.find({ where: { locationId } as any, select: ['outlineId'] })
    return rows.map(r => r.outlineId)
  }

  async getLocationIdsByOutlineIds(outlineIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (outlineIds.length === 0) return result
    const rows = await this.scoped.find({
      where: { outlineId: In(outlineIds) } as any,
      select: ['outlineId', 'locationId'],
    })
    for (const row of rows) {
      if (!result.has(row.outlineId)) result.set(row.outlineId, [])
      result.get(row.outlineId)!.push(row.locationId)
    }
    for (const id of outlineIds) if (!result.has(id)) result.set(id, [])
    return result
  }

  async add(outlineId: string, locationId: string): Promise<OutlineLocationRelation> {
    const id = this.generateId()
    const now = Date.now()
    const existing = await this.scoped.findOne({ outlineId, locationId } as any)
    if (existing) return this.toDto(existing)
    const saved = await this.scoped.save({ id, outlineId, locationId, createdAt: now })
    return this.toDto(saved)
  }

  async batchAdd(outlineId: string, locationIds: string[]): Promise<void> {
    if (locationIds.length === 0) return
    // 串行门正确姿势（E2E 实测）：回调必须用事务 manager，禁止走全局 scoped 仓库——
    // 旧写法在 SQLite 串行门下 100% 抛"事务回调内禁止调用全局 manager"，导致
    // createOutline 带 involved* 时关联全部丢失且章号级联被跳过
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwOutlineLocationEntity)
      const now = Date.now()
      for (const lid of locationIds) {
        const existing = await repo.findOne({ where: { outlineId, locationId: lid } as any })
        if (existing) continue
        await repo.save(repo.create({ id: this.generateId(), outlineId, locationId: lid, createdAt: now }))
      }
    })
  }

  async replaceAll(outlineId: string, locationIds: string[]): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwOutlineLocationEntity)
      await repo.delete({ outlineId } as any)
      const now = Date.now()
      for (const lid of locationIds) {
        await repo.save(repo.create({ id: this.generateId(), outlineId, locationId: lid, createdAt: now }))
      }
    })
  }

  async delete(outlineId: string, locationId: string): Promise<boolean> {
    const affected = await this.scoped.delete({ outlineId, locationId } as any)
    return affected > 0
  }

  async deleteByOutlineId(outlineId: string): Promise<number> {
    return this.scoped.delete({ outlineId } as any)
  }

  async deleteByLocationId(locationId: string): Promise<number> {
    return this.scoped.delete({ locationId } as any)
  }

  async migrateFromJson(projectId: string): Promise<number> {
    const outlineRepo = this.dataSource.getRepository(LwOutlineEntity)
    const locRepo = this.dataSource.getRepository(LwLocationEntity)
    const outlines = await outlineRepo.find({ where: { projectId } as any, select: ['id', 'involvedLocations'] })
    const locs = await locRepo.find({ where: { projectId } as any, select: ['id', 'name'] })
    const nameToId = new Map<string, string>()
    for (const l of locs) nameToId.set(l.name, l.id)

    let migrated = 0
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwOutlineLocationEntity)
      const now = Date.now()
      for (const outline of outlines) {
        const names = (outline.involvedLocations as string[] | null) ?? []
        for (const name of names) {
          const lid = nameToId.get(name)
          if (!lid) continue
          const existing = await repo.findOne({ where: { outlineId: outline.id, locationId: lid } as any })
          if (!existing) {
            await repo.save(repo.create({ id: this.generateId(), outlineId: outline.id, locationId: lid, createdAt: now }))
            migrated++
          }
        }
      }
    })
    return migrated
  }

  private generateId(): string {
    return `ol_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
