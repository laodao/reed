/**
 * LW 设定集分类定义仓库（P0-2026-09-09）
 * @module database/repositories/lw-bible-kind.repository
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { LwBibleKindEntity } from '../entities/lw-bible-kind.entity'
import { BaseRepository } from '../base-repository'

export interface BibleKindDto {
  id: string
  key: string
  label: string
  icon: string | null
  sortOrder: number
  storage: 'entity' | 'custom'
  entityRepo: string | null
  fieldsSchema: Array<{ key: string; label: string; type: string; options?: string[]; required?: boolean }> | null
  promptHint: string | null
  enabled: boolean
}

function parseSchema(json: string | null): BibleKindDto['fieldsSchema'] {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

export class LwBibleKindRepository extends BaseRepository<LwBibleKindEntity, BibleKindDto> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwBibleKindEntity)
  }

  protected toDto(e: LwBibleKindEntity): BibleKindDto {
    return {
      id: e.id,
      key: e.key,
      label: e.label,
      icon: e.icon,
      sortOrder: e.sortOrder,
      storage: e.storage as BibleKindDto['storage'],
      entityRepo: e.entityRepo,
      fieldsSchema: parseSchema(e.fieldsSchema),
      promptHint: e.promptHint,
      enabled: e.enabled === 1,
    }
  }

  async getEnabled(): Promise<BibleKindDto[]> {
    // 全局配置：raw repo（不注 user_id 过滤），按 key 唯一
    const rows = await this.repo.find({
      where: { enabled: 1 },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    } as any)
    return this.toDtoList(rows)
  }

  async getByKey(key: string): Promise<BibleKindDto | null> {
    // kinds 是产品级配置（全局行 user_id NULL）——raw repo 直查，不走租户 scoped
    const row = await this.repo.findOne({ where: { key } as any })
    return row ? this.toDto(row) : null
  }

  /** 种子/更新：按 key 幂等 upsert（内置分类升级字段模板时不覆盖用户改名） */
  async upsertSeed(seed: {
    key: string
    label: string
    icon?: string
    sortOrder?: number
    storage: 'entity' | 'custom'
    entityRepo?: string
    fieldsSchema?: Array<{ key: string; label: string; type: string; options?: string[]; required?: boolean }>
    promptHint?: string
  }): Promise<void> {
    const existing = await this.getByKey(seed.key)
    if (existing) return
    const row = this.repo.create({
      id: `bk_${randomUUID().slice(0, 8)}`,
      key: seed.key,
      label: seed.label,
      icon: seed.icon ?? null,
      sortOrder: seed.sortOrder ?? 100,
      storage: seed.storage,
      entityRepo: seed.entityRepo ?? null,
      fieldsSchema: seed.fieldsSchema ? JSON.stringify(seed.fieldsSchema) : null,
      promptHint: seed.promptHint ?? null,
      enabled: 1,
    } as never)
    await this.repo.save(row)
  }
}
