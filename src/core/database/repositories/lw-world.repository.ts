/**
 * LW 世界观库仓库（设定资产库 P0-2026-09-24）
 * @module database/repositories/lw-world.repository
 */

import type { DataSource } from 'typeorm'
import { LwWorldEntity } from '../entities/lw-world.entity'
import { BaseRepository } from '../base-repository'
import type { World, WorldStatus, UpdateWorldRequest } from '@shared/types/lw-library.types'

function parseJsonArray(v: string | null): string[] {
  if (!v) return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export class LwWorldRepository extends BaseRepository<LwWorldEntity, World> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwWorldEntity)
  }

  protected toDto(e: LwWorldEntity): World {
    return {
      id: e.id,
      name: e.name,
      genre: e.genre,
      tagline: e.tagline ?? '',
      description: e.description ?? '',
      coverPath: e.coverPath,
      status: e.status as WorldStatus,
      version: e.version,
      tags: parseJsonArray(e.tags),
      createdAt: Number(e.createdAt) || 0,
      updatedAt: Number(e.updatedAt) || 0,
    }
  }

  async listActive(): Promise<World[]> {
    const rows = await this.scoped.find({
      where: { status: 'active' } as any,
      order: { updatedAt: 'DESC' },
    } as any)
    return this.toDtoList(rows)
  }

  async listAll(): Promise<World[]> {
    const rows = await this.scoped.find({ order: { updatedAt: 'DESC' } } as any)
    return this.toDtoList(rows)
  }

  async getById(id: string): Promise<World | null> {
    const row = await this.scoped.findOne({ id } as any)
    return row ? this.toDto(row) : null
  }

  async create(data: {
    id: string
    name: string
    genre: string
    tagline?: string
    description?: string
    tags?: string[]
  }): Promise<World> {
    const now = Date.now()
    const entity = this.repo.create({
      id: data.id,
      name: data.name,
      genre: data.genre,
      tagline: data.tagline ?? null,
      description: data.description ?? null,
      status: 'active',
      version: 1,
      tags: data.tags && data.tags.length > 0 ? JSON.stringify(data.tags) : null,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async updateRow(id: string, data: UpdateWorldRequest): Promise<World | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null
    if (data.name !== undefined) existing.name = data.name
    if (data.genre !== undefined) existing.genre = data.genre
    if (data.tagline !== undefined) existing.tagline = data.tagline
    if (data.description !== undefined) existing.description = data.description
    if (data.coverPath !== undefined) existing.coverPath = data.coverPath
    if (data.status !== undefined) existing.status = data.status
    if (data.tags !== undefined) {
      existing.tags = data.tags.length > 0 ? JSON.stringify(data.tags) : null
    }
    existing.updatedAt = Date.now()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async deleteRow(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  /** 条目/同步变更后 bump 版本（血缘比对依据） */
  async bumpVersion(id: string): Promise<void> {
    // 单条原子自增 UPDATE：version = version + 1。读行→version+1→save 整行在并发下
    // 丢自增（lost update）。scoped.update 走 Repository.update → UpdateQueryBuilder
    // .set()，函数值即 SQL 表达式，且 scoped 代理自动注入 user_id 租户条件
    // （此前 scoped.qb().update() 带别名在 SQLite 上非法，update() 走 where 条件无别名，
    // 两种方言都安全）。函数值类型与数值列不兼容，需要 as any。
    await this.scoped.update(
      { id } as any,
      {
        version: () => 'version + 1',
        updatedAt: Date.now(),
      } as any,
    )
  }
}
