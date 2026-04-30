/**
 * 大纲角色关联仓库
 * @module database/repositories/lw-outline-character.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, type DataSource } from 'typeorm'
import { LwOutlineCharacterEntity } from '../entities/lw-outline-character.entity'
import { LwOutlineEntity } from '../entities/lw-outline.entity'
import { LwCharacterEntity } from '../entities/lw-character.entity'
import { BaseRepository } from '../base-repository'

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
    const rows = await this.repo.find({ where: { outlineId } as any, select: ['characterId'] })
    return rows.map(r => r.characterId)
  }

  async getOutlineIdsByCharacterId(characterId: string): Promise<string[]> {
    const rows = await this.repo.find({ where: { characterId } as any, select: ['outlineId'] })
    return rows.map(r => r.outlineId)
  }

  async getCharacterIdsByOutlineIds(outlineIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (outlineIds.length === 0) return result
    const rows = await this.repo.find({
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
    const existing = await this.repo.findOne({ where: { outlineId, characterId } as any })
    if (existing) return this.toDto(existing)
    const saved = await this.repo.save(this.repo.create({ id, outlineId, characterId, createdAt: now }))
    return this.toDto(saved)
  }

  async batchAdd(outlineId: string, characterIds: string[]): Promise<void> {
    if (characterIds.length === 0) return
    await this.dataSource.transaction(async () => {
      for (const cid of characterIds) await this.add(outlineId, cid)
    })
  }

  async replaceAll(outlineId: string, characterIds: string[]): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwOutlineCharacterEntity)
      await repo.delete({ outlineId } as any)
      const now = Date.now()
      for (const cid of characterIds) {
        await repo.save(repo.create({ id: this.generateId(), outlineId, characterId: cid, createdAt: now }))
      }
    })
  }

  async delete(outlineId: string, characterId: string): Promise<boolean> {
    const result = await this.repo.delete({ outlineId, characterId } as any)
    return (result.affected ?? 0) > 0
  }

  async deleteByOutlineId(outlineId: string): Promise<number> {
    const result = await this.repo.delete({ outlineId } as any)
    return result.affected ?? 0
  }

  async deleteByCharacterId(characterId: string): Promise<number> {
    const result = await this.repo.delete({ characterId } as any)
    return result.affected ?? 0
  }

  async migrateFromJson(projectId: string): Promise<number> {
    const outlineRepo = this.dataSource.getRepository(LwOutlineEntity)
    const charRepo = this.dataSource.getRepository(LwCharacterEntity)
    const outlines = await outlineRepo.find({ where: { projectId } as any, select: ['id', 'involvedCharacters'] })
    const characters = await charRepo.find({ where: { projectId } as any, select: ['id', 'name'] })
    const nameToId = new Map<string, string>()
    for (const c of characters) nameToId.set(c.name, c.id)

    let migrated = 0
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
            await repo.save(repo.create({ id: this.generateId(), outlineId: outline.id, characterId: cid, createdAt: now }))
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
