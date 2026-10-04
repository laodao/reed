/**
 * LW 世界观条目仓库（设定资产库 P0-2026-09-24）
 * @module database/repositories/lw-world-entry.repository
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { LwWorldEntryEntity } from '../entities/lw-world-entry.entity'
import { BaseRepository } from '../base-repository'
import type {
  WorldEntry,
  CreateWorldEntryRequest,
  UpdateWorldEntryRequest,
} from '@shared/types/lw-library.types'

function parseJsonArray(v: string | null): string[] {
  if (!v) return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function parseJsonObject(v: string | null): Record<string, unknown> | null {
  if (!v) return null
  try {
    const parsed = JSON.parse(v)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export class LwWorldEntryRepository extends BaseRepository<LwWorldEntryEntity, WorldEntry> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwWorldEntryEntity)
  }

  protected toDto(e: LwWorldEntryEntity): WorldEntry {
    return {
      id: e.id,
      worldId: e.worldId,
      kindKey: e.kindKey,
      name: e.name,
      aliases: parseJsonArray(e.aliases),
      summary: e.summary ?? '',
      fields: parseJsonObject(e.fields),
      parentId: e.parentId,
      sortOrder: e.sortOrder,
      rankValue: e.rankValue,
      pinned: e.pinned === 1,
      origin: parseJsonObject(e.origin),
      createdAt: Number(e.createdAt) || 0,
      updatedAt: Number(e.updatedAt) || 0,
    }
  }

  async listByWorldId(worldId: string): Promise<WorldEntry[]> {
    const rows = await this.scoped.find({
      where: { worldId } as any,
      order: { kindKey: 'ASC', sortOrder: 'ASC', rankValue: 'ASC' },
    } as any)
    return this.toDtoList(rows)
  }

  async listByWorldAndKind(worldId: string, kindKey: string): Promise<WorldEntry[]> {
    const rows = await this.scoped.find({
      where: { worldId, kindKey } as any,
      order: { sortOrder: 'ASC', rankValue: 'ASC', createdAt: 'ASC' },
    } as any)
    return this.toDtoList(rows)
  }

  async listPinnedByWorldId(worldId: string): Promise<WorldEntry[]> {
    const rows = await this.scoped.find({
      where: { worldId, pinned: 1 } as any,
      order: { kindKey: 'ASC', sortOrder: 'ASC' },
    } as any)
    return this.toDtoList(rows)
  }

  async getById(id: string): Promise<WorldEntry | null> {
    const row = await this.scoped.findOne({ id } as any)
    return row ? this.toDto(row) : null
  }

  async countByWorldId(worldId: string): Promise<number> {
    return this.scoped.count({ worldId } as any)
  }

  async create(data: CreateWorldEntryRequest): Promise<WorldEntry> {
    const now = Date.now()
    const entity = this.repo.create({
      id: `we_${randomUUID().slice(0, 12)}`,
      worldId: data.worldId,
      kindKey: data.kindKey,
      name: data.name,
      aliases: data.aliases && data.aliases.length > 0 ? JSON.stringify(data.aliases) : null,
      summary: data.summary ?? null,
      fields: data.fields ? JSON.stringify(data.fields) : null,
      parentId: data.parentId ?? null,
      sortOrder: data.sortOrder ?? 0,
      rankValue: data.rankValue ?? null,
      pinned: data.pinned ? 1 : 0,
      origin: JSON.stringify({ type: 'manual' }),
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async updateRow(id: string, data: UpdateWorldEntryRequest): Promise<WorldEntry | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null
    if (data.name !== undefined) existing.name = data.name
    if (data.aliases !== undefined) {
      existing.aliases = data.aliases.length > 0 ? JSON.stringify(data.aliases) : null
    }
    if (data.summary !== undefined) existing.summary = data.summary
    if (data.fields !== undefined) {
      existing.fields = data.fields ? JSON.stringify(data.fields) : null
    }
    if (data.parentId !== undefined) existing.parentId = data.parentId
    if (data.sortOrder !== undefined) existing.sortOrder = data.sortOrder
    if (data.rankValue !== undefined) existing.rankValue = data.rankValue
    if (data.pinned !== undefined) existing.pinned = data.pinned ? 1 : 0
    existing.updatedAt = Date.now()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async updateOrigin(id: string, origin: Record<string, unknown>): Promise<void> {
    await this.repo.update({ id } as any, { origin: JSON.stringify(origin), updatedAt: Date.now() })
  }

  async reorder(orderList: { id: string; order: number }[]): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwWorldEntryEntity)
      for (const item of orderList) {
        await repo.update({ id: item.id } as any, { sortOrder: item.order, updatedAt: Date.now() })
      }
    })
  }

  async deleteRow(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByWorldId(worldId: string): Promise<void> {
    await this.scoped.delete({ worldId } as any)
  }
}
