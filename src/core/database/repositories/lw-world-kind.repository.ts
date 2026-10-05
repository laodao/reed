/**
 * LW 世界观分类定义仓库（设定资产库 P0-2026-09-24）
 * 机制照 lw-bible-kind.repository，作用域为 world 级（每世界一套 kinds）。
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { LwWorldKindEntity } from '../entities/lw-world-kind.entity'
import { BaseRepository } from '../base-repository'
import type { WorldKind, LibraryFieldSchemaItem } from '@shared/types/lw-library.types'

function parseSchema(json: string | null): LibraryFieldSchemaItem[] | null {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

export class LwWorldKindRepository extends BaseRepository<LwWorldKindEntity, WorldKind> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwWorldKindEntity)
  }

  protected toDto(e: LwWorldKindEntity): WorldKind {
    return {
      id: e.id,
      worldId: e.worldId,
      key: e.key,
      label: e.label,
      icon: e.icon,
      sortOrder: e.sortOrder,
      fieldsSchema: parseSchema(e.fieldsSchema),
      promptHint: e.promptHint,
      enabled: e.enabled === 1,
    }
  }

  async listByWorldId(worldId: string): Promise<WorldKind[]> {
    const rows = await this.scoped.find({
      where: { worldId, enabled: 1 } as any,
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    } as any)
    return this.toDtoList(rows)
  }

  async getByWorldAndKey(worldId: string, key: string): Promise<WorldKind | null> {
    const row = await this.scoped.findOne({ worldId, key } as any)
    return row ? this.toDto(row) : null
  }

  async create(data: {
    worldId: string
    key: string
    label: string
    icon?: string | null
    sortOrder?: number
    fieldsSchema?: LibraryFieldSchemaItem[] | null
    promptHint?: string | null
  }): Promise<WorldKind> {
    const now = Date.now()
    const entity = this.repo.create({
      id: `wkind_${randomUUID().slice(0, 12)}`,
      worldId: data.worldId,
      key: data.key,
      label: data.label,
      icon: data.icon ?? null,
      sortOrder: data.sortOrder ?? 100,
      fieldsSchema: data.fieldsSchema ? JSON.stringify(data.fieldsSchema) : null,
      promptHint: data.promptHint ?? null,
      enabled: 1,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  /** 模板播种：按 (worldId, key) 幂等 upsert */
  async upsertSeed(seed: {
    worldId: string
    key: string
    label: string
    icon?: string
    sortOrder?: number
    fieldsSchema?: LibraryFieldSchemaItem[] | null
    promptHint?: string | null
  }): Promise<void> {
    const existing = await this.repo.findOne({ where: { worldId: seed.worldId, key: seed.key } as any })
    if (existing) return
    const now = Date.now()
    const entity = this.repo.create({
      id: `wkind_${randomUUID().slice(0, 12)}`,
      worldId: seed.worldId,
      key: seed.key,
      label: seed.label,
      icon: seed.icon ?? null,
      sortOrder: seed.sortOrder ?? 100,
      fieldsSchema: seed.fieldsSchema ? JSON.stringify(seed.fieldsSchema) : null,
      promptHint: seed.promptHint ?? null,
      enabled: 1,
      createdAt: now,
      updatedAt: now,
    })
    await this.scoped.save(entity)
  }

  async deleteRow(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByWorldId(worldId: string): Promise<void> {
    await this.scoped.delete({ worldId } as any)
  }
}
