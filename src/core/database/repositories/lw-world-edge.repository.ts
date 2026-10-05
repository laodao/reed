/**
 * LW 世界观库内静态关系边仓库（设定资产库 P0-2026-09-24）
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { LwWorldEdgeEntity } from '../entities/lw-world-edge.entity'
import { BaseRepository } from '../base-repository'
import type { WorldEdge } from '@shared/types/lw-library.types'

export class LwWorldEdgeRepository extends BaseRepository<LwWorldEdgeEntity, WorldEdge> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwWorldEdgeEntity)
  }

  protected toDto(e: LwWorldEdgeEntity): WorldEdge {
    return {
      id: e.id,
      worldId: e.worldId,
      sourceId: e.sourceId,
      targetId: e.targetId,
      relationType: e.relationType,
      label: e.label,
      origin: e.origin ? this.safeParse(e.origin) : null,
      createdAt: Number(e.createdAt) || 0,
    }
  }

  private safeParse(v: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(v)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }

  async listByWorldId(worldId: string): Promise<WorldEdge[]> {
    const rows = await this.scoped.find({
      where: { worldId } as any,
      order: { createdAt: 'ASC' },
    } as any)
    return this.toDtoList(rows)
  }

  async create(data: {
    worldId: string
    sourceId: string
    targetId: string
    relationType: string
    label?: string | null
  }): Promise<WorldEdge> {
    const entity = this.repo.create({
      id: `wed_${randomUUID().slice(0, 12)}`,
      worldId: data.worldId,
      sourceId: data.sourceId,
      targetId: data.targetId,
      relationType: data.relationType,
      label: data.label ?? null,
      origin: JSON.stringify({ type: 'manual' }),
      createdAt: Date.now(),
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async deleteRow(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByWorldId(worldId: string): Promise<void> {
    await this.scoped.delete({ worldId } as any)
  }
}
