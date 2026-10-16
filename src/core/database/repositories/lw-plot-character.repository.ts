/**
 * 情节角色关联仓库
 * @module database/repositories/lw-plot-character.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, IsNull } from 'typeorm'
import type { DataSource } from 'typeorm'
import { LwPlotCharacterEntity } from '../entities/lw-plot-character.entity'
import { LwPlotEntity } from '../entities/lw-plot.entity'
import { LwCharacterEntity } from '../entities/lw-character.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface PlotCharacterRelation {
  id: string
  plotId: string
  characterId: string
  createdAt: number
}

export class LwPlotCharacterRepository extends BaseRepository<
  LwPlotCharacterEntity,
  PlotCharacterRelation
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwPlotCharacterEntity)
  }

  protected toDto(e: LwPlotCharacterEntity): PlotCharacterRelation {
    return { id: e.id, plotId: e.plotId, characterId: e.characterId, createdAt: e.createdAt }
  }

  async getCharacterIdsByPlotId(plotId: string): Promise<string[]> {
    const rows = await this.scoped.find({ where: { plotId } as any, select: ['characterId'] })
    return rows.map(r => r.characterId)
  }

  async getPlotIdsByCharacterId(characterId: string): Promise<string[]> {
    const rows = await this.scoped.find({ where: { characterId } as any, select: ['plotId'] })
    return rows.map(r => r.plotId)
  }

  async getCharacterIdsByPlotIds(plotIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (plotIds.length === 0) return result
    const rows = await this.scoped.find({
      where: { plotId: In(plotIds) } as any,
      select: ['plotId', 'characterId'],
    })
    for (const row of rows) {
      if (!result.has(row.plotId)) result.set(row.plotId, [])
      result.get(row.plotId)!.push(row.characterId)
    }
    for (const id of plotIds) if (!result.has(id)) result.set(id, [])
    return result
  }

  async add(plotId: string, characterId: string): Promise<PlotCharacterRelation> {
    const id = this.generateId()
    const now = Date.now()
    const existing = await this.scoped.findOne({ plotId, characterId } as any)
    if (existing) return this.toDto(existing)
    const saved = await this.scoped.save({ id, plotId, characterId, createdAt: now })
    return this.toDto(saved)
  }

  async batchAdd(plotId: string, characterIds: string[]): Promise<void> {
    if (characterIds.length === 0) return
    await this.dataSource.transaction(async () => {
      for (const cid of characterIds) await this.add(plotId, cid)
    })
  }

  async replaceAll(plotId: string, characterIds: string[]): Promise<void> {
    // 事务回调内的裸 manager 仓储不走 scoped 注入——事务外同步捕获 userId，
    // 写入显式落列、删除显式过滤（口径与 base-repository 的 scopeWhere/scopeEntity 一致；
    // 漏注入的行 user_id=NULL，对所有 scoped 读不可见）
    const userId = getCurrentUserId()
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwPlotCharacterEntity)
      await repo.delete({ plotId, userId: userId === null ? IsNull() : userId } as any)
      const now = Date.now()
      for (const cid of characterIds) {
        await repo.save(repo.create({ id: this.generateId(), plotId, userId, characterId: cid, createdAt: now }))
      }
    })
  }

  async delete(plotId: string, characterId: string): Promise<boolean> {
    const affected = await this.scoped.delete({ plotId, characterId } as any)
    return affected > 0
  }

  async deleteByPlotId(plotId: string): Promise<number> {
    return this.scoped.delete({ plotId } as any)
  }

  async deleteByCharacterId(characterId: string): Promise<number> {
    return this.scoped.delete({ characterId } as any)
  }

  /** 从 lw_story_plots.involved_characters JSON（角色名）迁移到关联表 */
  async migrateFromJson(projectId: string): Promise<number> {
    const plotRepo = this.dataSource.getRepository(LwPlotEntity)
    const charRepo = this.dataSource.getRepository(LwCharacterEntity)
    const plots = await plotRepo.find({ where: { projectId } as any, select: ['id', 'involvedCharacters'] })
    const characters = await charRepo.find({ where: { projectId } as any, select: ['id', 'name'] })
    const nameToId = new Map<string, string>()
    for (const c of characters) nameToId.set(c.name, c.id)

    let migrated = 0
    const userId = getCurrentUserId()
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwPlotCharacterEntity)
      const now = Date.now()
      for (const plot of plots) {
        const names = (plot.involvedCharacters as string[] | null) ?? []
        for (const name of names) {
          const cid = nameToId.get(name)
          if (!cid) continue
          const existing = await repo.findOne({ where: { plotId: plot.id, characterId: cid } as any })
          if (!existing) {
            await repo.save(repo.create({ id: this.generateId(), plotId: plot.id, userId, characterId: cid, createdAt: now }))
            migrated++
          }
        }
      }
    })
    return migrated
  }

  private generateId(): string {
    return `pc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
