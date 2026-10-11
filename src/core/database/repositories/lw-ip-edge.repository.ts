/**
 * LW 角色 IP 库内人物关系边仓库（设定资产库 P0-2026-09-24）
 *
 * 【统一图存储 facade】2026-10-10 起本仓储只是 GraphStore 的 IP 库视图：
 * 存储落 graph_edges（graph_name='lw:ip'，端点 kind='ip_character'），老表 lw_ip_edges
 * 停写（保留供回填/回滚，清理见设计 §8 Phase 3）。方法签名与 DTO 保持不变，调用方零改动。
 */

import type { DataSource } from 'typeorm'
import { LwIpEdgeEntity } from '../entities/lw-ip-edge.entity'
import { BaseRepository } from '../base-repository'
import type { IpEdge, CreateIpEdgeRequest } from '@shared/types/lw-library.types'
import type { GraphEdge } from '@shared/types/graph-store.types'
import { GraphNames } from '@shared/constants/graph-store'
import { GraphStoreService } from '@core/platform/services/graph/store/graph-store.service'
import { GraphEdgeRepository } from './graph-edge.repository'

const GRAPH = GraphNames.lwIp()
const KIND = 'ip_character'

export class LwIpEdgeRepository extends BaseRepository<LwIpEdgeEntity, IpEdge> {
  private readonly store: GraphStoreService
  private readonly edgeRepo: GraphEdgeRepository

  constructor(dataSource: DataSource) {
    super(dataSource, LwIpEdgeEntity)
    this.store = GraphStoreService.forDataSource(dataSource)
    this.edgeRepo = new GraphEdgeRepository(dataSource)
  }

  /** 抽象方法实现（facade 后不再走老实体读取路径，仅为基类契约保留） */
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

  private static toIpEdge(e: GraphEdge): IpEdge {
    return {
      id: e.id,
      sourceId: e.source.id,
      targetId: e.target.id,
      relationType: e.relation,
      label: e.label,
      description: e.description,
      createdAt: e.createdAt,
    }
  }

  /** 双向查：某 IP 角色相关的一切边（作为 source 或 target） */
  async listByCharacterId(ipCharacterId: string): Promise<IpEdge[]> {
    return this.listByCharacterIds([ipCharacterId])
  }

  async listByCharacterIds(ids: string[]): Promise<IpEdge[]> {
    if (ids.length === 0) return []
    const edges = await this.store.listEdges(GRAPH)
    return edges
      .filter((e) => ids.includes(e.source.id) || ids.includes(e.target.id))
      .map((e) => LwIpEdgeRepository.toIpEdge(e))
  }

  async create(data: CreateIpEdgeRequest): Promise<IpEdge> {
    const spec = {
      source: { kind: KIND, id: data.sourceId },
      target: { kind: KIND, id: data.targetId },
      relation: data.relationType,
      label: data.label ?? null,
      description: data.description ?? null,
    }
    const created = await this.store.addEdge(GRAPH, spec)
    if (created) return LwIpEdgeRepository.toIpEdge(created)
    // 统一存储约束：同五元组活跃边只留一条（旧表无约束，重复点击会造重复行）——
    // 返回现存活跃边保持「总是返回一条」契约
    const existing = await this.store.listEdges(GRAPH, { ...spec, activeOnly: true })
    return LwIpEdgeRepository.toIpEdge(existing[0])
  }

  async deleteRow(id: string): Promise<boolean> {
    const edge = await this.edgeRepo.findById(id)
    if (!edge || edge.graphName !== GRAPH) return false
    return this.store.removeEdge(edge.graphName, id)
  }
}
