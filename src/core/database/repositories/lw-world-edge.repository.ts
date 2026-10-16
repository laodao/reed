/**
 * LW 世界观库内静态关系边仓库（设定资产库 P0-2026-09-24）
 *
 * 【统一图存储 facade】2026-10-10 起本仓储只是 GraphStore 的世界观库视图：
 * 存储落 graph_edges（graph_name='lw:world:{worldId}'，端点 kind='world_entry'），
 * 老表 lw_world_edges 停写（保留供回填/回滚）。方法签名与 DTO 保持不变，调用方零改动。
 */

import type { DataSource } from 'typeorm'
import { LwWorldEdgeEntity } from '../entities/lw-world-edge.entity'
import { BaseRepository } from '../base-repository'
import type { WorldEdge } from '@shared/types/lw-library.types'
import type { GraphEdge } from '@shared/types/graph-store.types'
import { GraphNames } from '@shared/constants/graph-store'
import { GraphStoreService } from '@core/platform/services/graph/store/graph-store.service'
import { GraphEdgeRepository } from './graph-edge.repository'

const KIND = 'world_entry'

export class LwWorldEdgeRepository extends BaseRepository<LwWorldEdgeEntity, WorldEdge> {
  private readonly store: GraphStoreService
  private readonly edgeRepo: GraphEdgeRepository

  constructor(dataSource: DataSource) {
    super(dataSource, LwWorldEdgeEntity)
    this.store = GraphStoreService.forDataSource(dataSource)
    this.edgeRepo = new GraphEdgeRepository(dataSource)
  }

  /** 抽象方法实现（facade 后不再走老实体读取路径，仅为基类契约保留） */
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

  private static toWorldEdge(e: GraphEdge): WorldEdge {
    return {
      id: e.id,
      worldId: e.graphName.slice(GraphNames.lwWorld('').length),
      sourceId: e.source.id,
      targetId: e.target.id,
      relationType: e.relation,
      label: e.label,
      origin: e.origin && typeof e.origin === 'object' ? (e.origin as Record<string, unknown>) : null,
      createdAt: e.createdAt,
    }
  }

  async listByWorldId(worldId: string): Promise<WorldEdge[]> {
    const edges = await this.store.listEdges(GraphNames.lwWorld(worldId))
    return edges.map((e) => LwWorldEdgeRepository.toWorldEdge(e))
  }

  async create(data: {
    worldId: string
    sourceId: string
    targetId: string
    relationType: string
    label?: string | null
  }): Promise<WorldEdge> {
    const spec = {
      source: { kind: KIND, id: data.sourceId },
      target: { kind: KIND, id: data.targetId },
      relation: data.relationType,
      label: data.label ?? null,
      origin: { type: 'manual' } as const,
    }
    const created = await this.store.addEdge(GraphNames.lwWorld(data.worldId), spec)
    if (created) return LwWorldEdgeRepository.toWorldEdge(created)
    const existing = await this.store.listEdges(GraphNames.lwWorld(data.worldId), { ...spec, activeOnly: true })
    return LwWorldEdgeRepository.toWorldEdge(existing[0])
  }

  async deleteRow(id: string): Promise<boolean> {
    const edge = await this.edgeRepo.findById(id)
    if (!edge || !edge.graphName.startsWith(GraphNames.lwWorld(''))) return false
    return this.store.removeEdge(edge.graphName, id)
  }

  async deleteByWorldId(worldId: string): Promise<void> {
    await this.store.removeGraph(GraphNames.lwWorld(worldId))
  }
}
