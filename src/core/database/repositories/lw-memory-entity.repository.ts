/**
 * 记忆实体关联仓库
 * @module database/repositories/lw-memory-entity.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, IsNull, type DataSource } from 'typeorm'
import { MemoryEntity } from '@shared/types/longwriting.types'
import { LwMemoryEntityEntity } from '../entities/lw-memory-entity.entity'
import { LwMemoryEntity } from '../entities/lw-memory.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export class LwMemoryEntityRepository extends BaseRepository<
  LwMemoryEntityEntity,
  MemoryEntity
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwMemoryEntityEntity)
  }

  protected toDto(e: LwMemoryEntityEntity): MemoryEntity {
    return {
      type: e.entityType as MemoryEntity['type'],
      id: e.entityId,
      name: e.entityName,
    }
  }

  async getEntitiesByMemoryId(memoryId: string): Promise<MemoryEntity[]> {
    const rows = await this.scoped.find({ where: { memoryId } as any })
    return rows.map(r => this.toDto(r))
  }

  async getMemoryIdsByEntity(
    entityType: MemoryEntity['type'],
    entityId: string,
  ): Promise<string[]> {
    const rows = await this.scoped.find({
      where: { entityType, entityId } as any,
      select: ['memoryId'],
    })
    return rows.map(r => r.memoryId)
  }

  async getEntitiesByMemoryIds(
    memoryIds: string[],
  ): Promise<Map<string, MemoryEntity[]>> {
    const result = new Map<string, MemoryEntity[]>()
    if (memoryIds.length === 0) return result
    const rows = await this.scoped.find({
      where: { memoryId: In(memoryIds) } as any,
    })
    for (const row of rows) {
      if (!result.has(row.memoryId)) result.set(row.memoryId, [])
      result.get(row.memoryId)!.push(this.toDto(row))
    }
    for (const id of memoryIds) if (!result.has(id)) result.set(id, [])
    return result
  }

  async add(memoryId: string, entity: MemoryEntity): Promise<void> {
    const existing = await this.repo.findOne({
      where: {
        memoryId,
        entityType: entity.type,
        entityId: entity.id,
      } as any,
    })
    if (existing) return
    await this.scoped.save({
        id: this.generateId(),
        memoryId,
        entityType: entity.type,
        entityId: entity.id,
        entityName: entity.name,
        createdAt: Date.now(),
      })
  }

  async batchAdd(memoryId: string, entities: MemoryEntity[]): Promise<void> {
    if (entities.length === 0) return
    await this.dataSource.transaction(async () => {
      for (const e of entities) await this.add(memoryId, e)
    })
  }

  async replaceAll(memoryId: string, entities: MemoryEntity[]): Promise<void> {
    // 多租户复核修复：事务内裸 repo.save/delete 不走 scoped，显式注入/限定 userId
    const userId = getCurrentUserId() ?? null
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwMemoryEntityEntity)
      await repo.delete({ memoryId, userId: userId ?? IsNull() } as any)
      const now = Date.now()
      for (const entity of entities) {
        await repo.save(
          repo.create({
            id: this.generateId(),
            userId,
            memoryId,
            entityType: entity.type,
            entityId: entity.id,
            entityName: entity.name,
            createdAt: now,
          }),
        )
      }
    })
  }

  async delete(
    memoryId: string,
    entityType: MemoryEntity['type'],
    entityId: string,
  ): Promise<boolean> {
    const affected = await this.scoped.delete({
      memoryId, entityType, entityId,
    } as any)
    return affected > 0
  }

  async deleteByMemoryId(memoryId: string): Promise<number> {
    return this.scoped.delete({ memoryId } as any)
  }

  async deleteByEntity(
    entityType: MemoryEntity['type'],
    entityId: string,
  ): Promise<number> {
    return this.scoped.delete({ entityType, entityId } as any)
  }

  async migrateFromJson(memoryId: string): Promise<number> {
    const memoryRepo = this.dataSource.getRepository(LwMemoryEntity)
    const memory = await memoryRepo.findOne({ where: { id: memoryId } as any })
    if (!memory?.involvedEntities) return 0
    let entities: MemoryEntity[]
    try {
      entities = JSON.parse(memory.involvedEntities)
    } catch {
      return 0
    }
    if (entities.length === 0) return 0
    await this.batchAdd(memoryId, entities)
    return entities.length
  }

  private generateId(): string {
    return `me_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
