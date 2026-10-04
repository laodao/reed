/**
 * LW 角色 IP 库内人物关系边仓库（设定资产库 P0-2026-09-24）
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { In } from 'typeorm'
import { LwIpEdgeEntity } from '../entities/lw-ip-edge.entity'
import { BaseRepository } from '../base-repository'
import type { IpEdge, CreateIpEdgeRequest } from '@shared/types/lw-library.types'

export class LwIpEdgeRepository extends BaseRepository<LwIpEdgeEntity, IpEdge> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwIpEdgeEntity)
  }

  protected toDto(e: LwIpEdgeEntity): IpEdge {
    return {
      id: e.id,
      sourceId: e.sourceId,
      targetId: e.targetId,
      relationType: e.relationType,
      label: e.label,
      description: e.description,
      createdAt: Number(e.createdAt) || 0,
    }
  }

  /** 双向查：某 IP 角色相关的一切边（作为 source 或 target） */
  async listByCharacterId(ipCharacterId: string): Promise<IpEdge[]> {
    const rows = await this.repo.find({
      where: [
        { sourceId: ipCharacterId },
        { targetId: ipCharacterId },
      ] as any,
      order: { createdAt: 'ASC' },
    } as any)
    return this.toDtoList(rows)
  }

  async listByCharacterIds(ids: string[]): Promise<IpEdge[]> {
    if (ids.length === 0) return []
    const rows = await this.repo.find({
      where: [
        { sourceId: In(ids) },
        { targetId: In(ids) },
      ] as any,
      order: { createdAt: 'ASC' },
    } as any)
    return this.toDtoList(rows)
  }

  async create(data: CreateIpEdgeRequest): Promise<IpEdge> {
    const entity = this.repo.create({
      id: `ipe_${randomUUID().slice(0, 12)}`,
      sourceId: data.sourceId,
      targetId: data.targetId,
      relationType: data.relationType,
      label: data.label ?? null,
      description: data.description ?? null,
      createdAt: Date.now(),
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async deleteRow(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }
}
