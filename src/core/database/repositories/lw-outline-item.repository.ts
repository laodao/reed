/**
 * 大纲物品关联仓库
 * @module database/repositories/lw-outline-item.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, type DataSource } from 'typeorm'
import { LwOutlineItemEntity } from '../entities/lw-outline-item.entity'
import { LwOutlineEntity } from '../entities/lw-outline.entity'
import { LwItemEntity } from '../entities/lw-item.entity'
import { BaseRepository } from '../base-repository'

export interface OutlineItemRelation {
  id: string
  outlineId: string
  itemId: string
  createdAt: number
}

export class LwOutlineItemRepository extends BaseRepository<
  LwOutlineItemEntity,
  OutlineItemRelation
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwOutlineItemEntity)
  }

  protected toDto(e: LwOutlineItemEntity): OutlineItemRelation {
    return { id: e.id, outlineId: e.outlineId, itemId: e.itemId, createdAt: e.createdAt }
  }

  async getItemIdsByOutlineId(outlineId: string): Promise<string[]> {
    const rows = await this.repo.find({ where: { outlineId } as any, select: ['itemId'] })
    return rows.map(r => r.itemId)
  }

  async getOutlineIdsByItemId(itemId: string): Promise<string[]> {
    const rows = await this.repo.find({ where: { itemId } as any, select: ['outlineId'] })
    return rows.map(r => r.outlineId)
  }

  async getItemIdsByOutlineIds(outlineIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (outlineIds.length === 0) return result
    const rows = await this.repo.find({
      where: { outlineId: In(outlineIds) } as any,
      select: ['outlineId', 'itemId'],
    })
    for (const row of rows) {
      if (!result.has(row.outlineId)) result.set(row.outlineId, [])
      result.get(row.outlineId)!.push(row.itemId)
    }
    for (const id of outlineIds) if (!result.has(id)) result.set(id, [])
    return result
  }

  async add(outlineId: string, itemId: string): Promise<OutlineItemRelation> {
    const id = this.generateId()
    const now = Date.now()
    const existing = await this.repo.findOne({ where: { outlineId, itemId } as any })
    if (existing) return this.toDto(existing)
    const saved = await this.repo.save(this.repo.create({ id, outlineId, itemId, createdAt: now }))
    return this.toDto(saved)
  }

  async batchAdd(outlineId: string, itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return
    await this.dataSource.transaction(async () => {
      for (const iid of itemIds) await this.add(outlineId, iid)
    })
  }

  async replaceAll(outlineId: string, itemIds: string[]): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwOutlineItemEntity)
      await repo.delete({ outlineId } as any)
      const now = Date.now()
      for (const iid of itemIds) {
        await repo.save(repo.create({ id: this.generateId(), outlineId, itemId: iid, createdAt: now }))
      }
    })
  }

  async delete(outlineId: string, itemId: string): Promise<boolean> {
    const result = await this.repo.delete({ outlineId, itemId } as any)
    return (result.affected ?? 0) > 0
  }

  async deleteByOutlineId(outlineId: string): Promise<number> {
    const result = await this.repo.delete({ outlineId } as any)
    return result.affected ?? 0
  }

  async deleteByItemId(itemId: string): Promise<number> {
    const result = await this.repo.delete({ itemId } as any)
    return result.affected ?? 0
  }

  async migrateFromJson(projectId: string): Promise<number> {
    const outlineRepo = this.dataSource.getRepository(LwOutlineEntity)
    const itemRepo = this.dataSource.getRepository(LwItemEntity)
    const outlines = await outlineRepo.find({ where: { projectId } as any, select: ['id', 'involvedItems'] })
    const items = await itemRepo.find({ where: { projectId } as any, select: ['id', 'name'] })
    const nameToId = new Map<string, string>()
    for (const i of items) nameToId.set(i.name, i.id)

    let migrated = 0
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwOutlineItemEntity)
      const now = Date.now()
      for (const outline of outlines) {
        const names = (outline.involvedItems as string[] | null) ?? []
        for (const name of names) {
          const iid = nameToId.get(name)
          if (!iid) continue
          const existing = await repo.findOne({ where: { outlineId: outline.id, itemId: iid } as any })
          if (!existing) {
            await repo.save(repo.create({ id: this.generateId(), outlineId: outline.id, itemId: iid, createdAt: now }))
            migrated++
          }
        }
      }
    })
    return migrated
  }

  private generateId(): string {
    return `oi_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
