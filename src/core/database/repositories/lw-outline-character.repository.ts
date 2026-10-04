/**
 * 大纲角色关联仓库
 * @module database/repositories/lw-outline-character.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, IsNull, type DataSource } from 'typeorm'
import { LwOutlineCharacterEntity } from '../entities/lw-outline-character.entity'
import { LwOutlineEntity } from '../entities/lw-outline.entity'
import { LwCharacterEntity } from '../entities/lw-character.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface OutlineCharacterRelation {
  id: string
  outlineId: string
  characterId: string
  createdAt: number
}

export class LwOutlineCharacterRepository extends BaseRepository<
  LwOutlineCharacterEntity,
  OutlineCharacterRelation
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwOutlineCharacterEntity)
  }

  protected toDto(e: LwOutlineCharacterEntity): OutlineCharacterRelation {
    return { id: e.id, outlineId: e.outlineId, characterId: e.characterId, createdAt: e.createdAt }
  }

  async getCharacterIdsByOutlineId(outlineId: string): Promise<string[]> {
    const rows = await this.scoped.find({ where: { outlineId } as any, select: ['characterId'] })
    return rows.map(r => r.characterId)
  }

  async getOutlineIdsByCharacterId(characterId: string): Promise<string[]> {
    const rows = await this.scoped.find({ where: { characterId } as any, select: ['outlineId'] })
    return rows.map(r => r.outlineId)
  }

  async getCharacterIdsByOutlineIds(outlineIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (outlineIds.length === 0) return result
    const rows = await this.scoped.find({
      where: { outlineId: In(outlineIds) } as any,
      select: ['outlineId', 'characterId'],
    })
    for (const row of rows) {
      if (!result.has(row.outlineId)) result.set(row.outlineId, [])
      result.get(row.outlineId)!.push(row.characterId)
    }
    for (const id of outlineIds) if (!result.has(id)) result.set(id, [])
    return result
  }

  async add(outlineId: string, characterId: string): Promise<OutlineCharacterRelation> {
    const id = this.generateId()
    const now = Date.now()
    const existing = await this.scoped.findOne({ outlineId, characterId } as any)
    if (existing) return this.toDto(existing)
    const saved = await this.scoped.save({ id, outlineId, characterId, createdAt: now })
    return this.toDto(saved)
  }

  async batchAdd(outlineId: string, characterIds: string[]): Promise<void> {
    if (characterIds.length === 0) return
    // 串行门正确姿势（E2E 实测）：回调必须用事务 manager，禁止走全局 scoped 仓库——
    // 旧写法在 SQLite 串行门下 100% 抛"事务回调内禁止调用全局 manager"，导致
    // createOutline 带 involved* 时关联全部丢失且章号级联被跳过
    // 多租户复核修复：事务内裸 repo.save 不走 scoped，必须显式注入 userId
    const userId = getCurrentUserId() ?? null
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwOutlineCharacterEntity)
      const now = Date.now()
      for (const cid of characterIds) {
        const existing = await repo.findOne({ where: { outlineId, characterId: cid } as any })
        if (existing) continue
        await repo.save(repo.create({ id: this.generateId(), userId, outlineId, characterId: cid, createdAt: now }))
      }
    })
  }

  async replaceAll(outlineId: string, characterIds: string[]): Promise<void> {
    const userId = getCurrentUserId() ?? null
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwOutlineCharacterEntity)
      // 租户条件：只清当前用户（或无主历史行）的关联，防跨租户删除
      await repo.delete({ outlineId, userId: userId ?? IsNull() } as any)
      const now = Date.now()
      for (const cid of characterIds) {
        await repo.save(repo.create({ id: this.generateId(), userId, outlineId, characterId: cid, createdAt: now }))
      }
    })
  }

  async delete(outlineId: string, characterId: string): Promise<boolean> {
    const affected = await this.scoped.delete({ outlineId, characterId } as any)
    return affected > 0
  }

  async deleteByOutlineId(outlineId: string): Promise<number> {
    return this.scoped.delete({ outlineId } as any)
  }

  async deleteByCharacterId(characterId: string): Promise<number> {
    return this.scoped.delete({ characterId } as any)
  }

  async migrateFromJson(projectId: string): Promise<number> {
    const outlineRepo = this.dataSource.getRepository(LwOutlineEntity)
    const charRepo = this.dataSource.getRepository(LwCharacterEntity)
    const outlines = await outlineRepo.find({ where: { projectId } as any, select: ['id', 'involvedCharacters'] })
    const characters = await charRepo.find({ where: { projectId } as any, select: ['id', 'name'] })
    const nameToId = new Map<string, string>()
    for (const c of characters) nameToId.set(c.name, c.id)

    let migrated = 0
    const userId = getCurrentUserId() ?? null
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwOutlineCharacterEntity)
      const now = Date.now()
      for (const outline of outlines) {
        const names = (outline.involvedCharacters as string[] | null) ?? []
        for (const name of names) {
          const cid = nameToId.get(name)
          if (!cid) continue
          const existing = await repo.findOne({ where: { outlineId: outline.id, characterId: cid } as any })
          if (!existing) {
            await repo.save(repo.create({ id: this.generateId(), userId, outlineId: outline.id, characterId: cid, createdAt: now }))
            migrated++
          }
        }
      }
    })
    return migrated
  }

  private generateId(): string {
    return `oc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
