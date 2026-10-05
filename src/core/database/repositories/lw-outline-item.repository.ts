/**
 * 大纲物品关联仓库
 * @module database/repositories/lw-outline-item.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, IsNull, type DataSource } from 'typeorm'
import { LwOutlineItemEntity } from '../entities/lw-outline-item.entity'
import { LwOutlineEntity } from '../entities/lw-outline.entity'
import { LwItemEntity } from '../entities/lw-item.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

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
    const rows = await this.scoped.find({ where: { outlineId } as any, select: ['itemId'] })
    return rows.map(r => r.itemId)
  }

  async getOutlineIdsByItemId(itemId: string): Promise<string[]> {
    const rows = await this.scoped.find({ where: { itemId } as any, select: ['outlineId'] })
    return rows.map(r => r.outlineId)
  }

  async getItemIdsByOutlineIds(outlineIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (outlineIds.length === 0) return result
    const rows = await this.scoped.find({
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
    const existing = await this.scoped.findOne({ outlineId, itemId } as any)
    if (existing) return this.toDto(existing)
    const saved = await this.scoped.save({ id, outlineId, itemId, createdAt: now })
    return this.toDto(saved)
  }

  async batchAdd(outlineId: string, itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return
    // 多租户复核修复：事务内裸 repo.save 不走 scoped，必须显式注入 userId
    const userId = getCurrentUserId() ?? null
    // 串行门正确姿势（E2E 实测）：回调必须用事务 manager，禁止走全局 scoped 仓库——
    // 旧写法在 SQLite 串行门下 100% 抛"事务回调内禁止调用全局 manager"，导致
    // createOutline 带 involved* 时关联全部丢失且章号级联被跳过
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwOutlineItemEntity)
      const now = Date.now()
      for (const iid of itemIds) {
        const existing = await repo.findOne({ where: { outlineId, itemId: iid } as any })
        if (existing) continue
        await repo.save(repo.create({ id: this.generateId(), userId, outlineId, itemId: iid, createdAt: now }))
      }
    })
  }

  async replaceAll(outlineId: string, itemIds: string[]): Promise<void> {
    const userId = getCurrentUserId() ?? null
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwOutlineItemEntity)
      // 租户条件：只清当前用户（或无主历史行）的关联，防跨租户删除
      await repo.delete({ outlineId, userId: userId ?? IsNull() } as any)
      const now = Date.now()
      for (const iid of itemIds) {
        await repo.save(repo.create({ id: this.generateId(), userId, outlineId, itemId: iid, createdAt: now }))
      }
    })
  }

  async delete(outlineId: string, itemId: string): Promise<boolean> {
    const affected = await this.scoped.delete({ outlineId, itemId } as any)
    return affected > 0
  }

  async deleteByOutlineId(outlineId: string): Promise<number> {
    return this.scoped.delete({ outlineId } as any)
  }

  async deleteByItemId(itemId: string): Promise<number> {
    return this.scoped.delete({ itemId } as any)
  }

  async migrateFromJson(projectId: string): Promise<number> {
    const outlineRepo = this.dataSource.getRepository(LwOutlineEntity)
    const itemRepo = this.dataSource.getRepository(LwItemEntity)
    const outlines = await outlineRepo.find({ where: { projectId } as any, select: ['id', 'involvedItems'] })
    const items = await itemRepo.find({ where: { projectId } as any, select: ['id', 'name'] })
    const nameToId = new Map<string, string>()
    for (const i of items) nameToId.set(i.name, i.id)

    let migrated = 0
    const userId = getCurrentUserId() ?? null
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
            await repo.save(repo.create({ id: this.generateId(), userId, outlineId: outline.id, itemId: iid, createdAt: now }))
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
