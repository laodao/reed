/**
 * 领域学习关系边仓库（dl_relation，design-v3 §9）
 * @module database/repositories/dl-relation.repository
 *
 * 概念图的有向边。relation_type 分层见 dl-relation.entity；「前置依赖」边
 * (source→target) 驱动学习门控。
 *
 * 【统一图存储 facade】2026-10-10 起本仓储只是 GraphStore 的领域学习视图：
 * 存储落 graph_edges（graph_name='dl:project:{projectId}'，端点 kind='concept'），
 * 老表 dl_relation 停写（保留供回填/回滚）。方法签名与 DTO 保持不变，调用方零改动。
 * upsert/verified 升级语义原样保留（create 内查重 + 升级置位）。
 */

import type { DataSource } from 'typeorm'
import { DlRelationEntity } from '../entities/domain-learning/dl-relation.entity'
import { BaseRepository } from '../base-repository'
import type { GraphEdge } from '@shared/types/graph-store.types'
import { GraphNames } from '@shared/constants/graph-store'
import { GraphStoreService } from '@core/platform/services/graph/store/graph-store.service'
import { GraphEdgeRepository } from './graph-edge.repository'

const KIND = 'concept'

/** dl_relation 行 DTO */
export interface DlRelationRow {
  id: string
  userId: string | null
  projectId: string
  sourceId: string
  targetId: string
  relationType: string
  evidence: string | null
  verified: boolean
  createdAt: Date | null
}

export type DlRelationPatch = Partial<{
  relationType: string
  evidence: string | null
  verified: boolean
}>

export class DlRelationRepository extends BaseRepository<DlRelationEntity, DlRelationRow> {
  private readonly store: GraphStoreService
  private readonly edgeRepo: GraphEdgeRepository

  constructor(dataSource: DataSource) {
    super(dataSource, DlRelationEntity)
    this.store = GraphStoreService.forDataSource(dataSource)
    this.edgeRepo = new GraphEdgeRepository(dataSource)
  }

  /** 抽象方法实现（facade 后不再走老实体读取路径，仅为基类契约保留） */
  protected toDto(e: DlRelationEntity): DlRelationRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      sourceId: e.sourceId,
      targetId: e.targetId,
      relationType: e.relationType,
      evidence: e.evidence,
      verified: e.verified === 1,
      createdAt: e.createdAt,
    }
  }

  private static projectIdOf(graphName: string): string {
    return graphName.slice(GraphNames.dlProject('').length)
  }

  private static toRow(e: GraphEdge): DlRelationRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: DlRelationRepository.projectIdOf(e.graphName),
      sourceId: e.source.id,
      targetId: e.target.id,
      relationType: e.relation,
      evidence: e.evidence,
      verified: e.verified,
      createdAt: e.createdAt > 0 ? new Date(e.createdAt) : null,
    }
  }

  /**
   * 创建边。同三元组已存在时：若 verified 升级（草案→确认）则更新证据/置 verified，
   * 否则视为重复（幂等返回已存在行）——老 upsert 语义原样保留。
   */
  async create(input: {
    id: string
    projectId: string
    sourceId: string
    targetId: string
    relationType: string
    evidence?: string | null
    verified?: boolean
  }): Promise<DlRelationRow> {
    const graph = GraphNames.dlProject(input.projectId)
    const existing = await this.store.listEdges(graph, {
      source: { kind: KIND, id: input.sourceId },
      target: { kind: KIND, id: input.targetId },
      relation: input.relationType,
    })
    if (existing[0]) {
      const cur = existing[0]
      if ((input.verified ?? false) && !cur.verified) {
        await this.patch(cur.id, { verified: true, evidence: input.evidence ?? cur.evidence })
      }
      return (await this.getById(cur.id))!
    }
    await this.edgeRepo.insertRows([
      {
        id: input.id,
        graphName: graph,
        sourceKind: KIND,
        sourceId: input.sourceId,
        targetKind: KIND,
        targetId: input.targetId,
        relation: input.relationType,
        evidence: input.evidence ?? null,
        verified: input.verified ? 1 : 0,
        createdAt: Date.now(),
      },
    ])
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<DlRelationRow | null> {
    const e = await this.edgeRepo.findById(id)
    if (!e || !e.graphName.startsWith(GraphNames.dlProject(''))) return null
    return DlRelationRepository.toRow(e)
  }

  /** 项目全部边（图聚合；个人规模全量内存遍历） */
  async listByProject(projectId: string): Promise<DlRelationRow[]> {
    const edges = await this.store.listEdges(GraphNames.dlProject(projectId))
    return edges.map((e) => DlRelationRepository.toRow(e))
  }

  /** 某节点为起点的边（related 派生/门控用） */
  async listBySource(projectId: string, sourceId: string): Promise<DlRelationRow[]> {
    const edges = await this.store.listEdges(GraphNames.dlProject(projectId), {
      source: { kind: KIND, id: sourceId },
    })
    return edges.map((e) => DlRelationRepository.toRow(e))
  }

  /** 某节点为终点的边 */
  async listByTarget(projectId: string, targetId: string): Promise<DlRelationRow[]> {
    const edges = await this.store.listEdges(GraphNames.dlProject(projectId), {
      target: { kind: KIND, id: targetId },
    })
    return edges.map((e) => DlRelationRepository.toRow(e))
  }

  /** 前置依赖（target 依赖 source；source→target 边，relationType 固定值） */
  async listPrerequisites(projectId: string, conceptId: string): Promise<DlRelationRow[]> {
    const edges = await this.store.listEdges(GraphNames.dlProject(projectId), {
      target: { kind: KIND, id: conceptId },
      relation: PREREQUISITE_TYPE,
    })
    return edges.map((e) => DlRelationRepository.toRow(e))
  }

  async patch(id: string, patch: DlRelationPatch): Promise<void> {
    const e = await this.edgeRepo.findById(id)
    if (!e || !e.graphName.startsWith(GraphNames.dlProject(''))) return
    await this.store.updateEdge(e.graphName, id, {
      relation: patch.relationType,
      evidence: patch.evidence,
      verified: patch.verified,
    })
  }

  async deleteById(id: string): Promise<number> {
    const e = await this.edgeRepo.findById(id)
    if (!e || !e.graphName.startsWith(GraphNames.dlProject(''))) return 0
    return (await this.store.removeEdge(e.graphName, id)) ? 1 : 0
  }

  /** 删某节点的全部关系边（出边+入边；删除知识点时级联清边用） */
  async deleteByConcept(projectId: string, conceptId: string): Promise<number> {
    const graph = GraphNames.dlProject(projectId)
    const out = await this.store.removeEdges(graph, { source: { kind: KIND, id: conceptId } })
    const inn = await this.store.removeEdges(graph, { target: { kind: KIND, id: conceptId } })
    return out + inn
  }
}

/** 前置依赖关系类型（source→target：学 target 前需掌握 source） */
export const PREREQUISITE_TYPE = 'prerequisite'
