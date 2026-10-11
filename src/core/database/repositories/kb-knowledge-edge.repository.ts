/**
 * 知识大脑·语义边仓库（kb_knowledge_edges 表）
 * @module database/repositories/kb-knowledge-edge.repository
 *
 * 【统一图存储 facade】2026-10-10 起本仓储只是 GraphStore 的知识大脑视图：
 * 存储落 graph_edges（graph_name='kb:{kbId}'，端点 kind=atom|note|entity），
 * 老表 kb_knowledge_edges 停写（保留供回填/回滚）。方法签名与 DTO 保持不变。
 *
 * 语义变化（设计 §10 风险 #9，已确认无害）：五元组查重带 graph_name（按库），
 * 旧实现的查重条件不含 knowledge_base_id（跨库去重，atom/note 为 UUID 实际无碰撞）。
 */

import type { DataSource } from 'typeorm'
import { KbKnowledgeEdgeEntity, type KbEdgeNodeKind, type KbEdgeRelation } from '../entities/kb-brain/kb-knowledge-edge.entity'
import { BaseRepository } from '../base-repository'
import type { GraphEdge } from '@shared/types/graph-store.types'
import { GraphNames } from '@shared/constants/graph-store'
import { GraphStoreService } from '@core/platform/services/graph/store/graph-store.service'

export interface KbEdgeRecord {
  id: string
  userId: string | null
  knowledgeBaseId: string
  sourceKind: KbEdgeNodeKind
  sourceId: string
  relation: KbEdgeRelation
  targetKind: KbEdgeNodeKind
  targetId: string
  evidence: string
  confidence: number
  origin: 'ai' | 'human'
  verified: number
  createdAt: Date | null
}

export interface KbEdgeInput {
  sourceKind: KbEdgeNodeKind
  sourceId: string
  relation: KbEdgeRelation
  targetKind: KbEdgeNodeKind
  targetId: string
  evidence: string
  confidence?: number
  origin?: 'ai' | 'human'
}

const KB_PREFIX = GraphNames.kb('') // 'kb:'

export class KbKnowledgeEdgeRepository extends BaseRepository<KbKnowledgeEdgeEntity, KbEdgeRecord> {
  private readonly store: GraphStoreService

  constructor(dataSource: DataSource) {
    super(dataSource, KbKnowledgeEdgeEntity)
    this.store = GraphStoreService.forDataSource(dataSource)
  }

  /** 抽象方法实现（facade 后不再走老实体读取路径，仅为基类契约保留） */
  protected toDto(e: KbKnowledgeEdgeEntity): KbEdgeRecord {
    return {
      id: e.id,
      userId: e.userId,
      knowledgeBaseId: e.knowledgeBaseId,
      sourceKind: e.sourceKind,
      sourceId: e.sourceId,
      relation: e.relation,
      targetKind: e.targetKind,
      targetId: e.targetId,
      evidence: e.evidence,
      confidence: e.confidence,
      origin: e.origin,
      verified: e.verified,
      createdAt: e.createdAt ?? null,
    }
  }

  private static kbIdOf(graphName: string): string {
    return graphName.slice(GraphNames.kb('').length)
  }

  /** origin 统一层存 JSON 对象（{type:'ai'}）；kb DTO 面还原为裸 'ai'|'human' */
  private static unwrapOrigin(origin: unknown): 'ai' | 'human' {
    if (origin === 'ai' || origin === 'human') return origin
    if (origin && typeof origin === 'object' && 'type' in origin) {
      const t = (origin as { type: unknown }).type
      if (t === 'ai' || t === 'human') return t
    }
    return 'ai'
  }

  private static toRecord(e: GraphEdge): KbEdgeRecord {
    return {
      id: e.id,
      userId: e.userId,
      knowledgeBaseId: KbKnowledgeEdgeRepository.kbIdOf(e.graphName),
      sourceKind: e.source.kind as KbEdgeNodeKind,
      sourceId: e.source.id,
      relation: e.relation as KbEdgeRelation,
      targetKind: e.target.kind as KbEdgeNodeKind,
      targetId: e.target.id,
      evidence: e.evidence ?? '',
      confidence: e.confidence ?? 0.7,
      origin: KbKnowledgeEdgeRepository.unwrapOrigin(e.origin),
      verified: e.verified ? 1 : 0,
      createdAt: e.createdAt > 0 ? new Date(e.createdAt) : null,
    }
  }

  private static toSpec(r: KbEdgeInput) {
    return {
      source: { kind: r.sourceKind, id: r.sourceId },
      target: { kind: r.targetKind, id: r.targetId },
      relation: r.relation,
      evidence: r.evidence,
      confidence: r.confidence ?? 0.7,
      origin: { type: r.origin ?? 'ai' } as const,
      verified: false,
    }
  }

  /**
   * 批量落边：命中唯一键（五元组，按库）跳过并计数（幂等——同批重跑/重复萃取不产生重复边）。
   */
  async createBatch(kbId: string, rows: KbEdgeInput[]): Promise<{ created: number; deduped: number }> {
    if (rows.length === 0) return { created: 0, deduped: 0 }
    const r = await this.store.addEdges(GraphNames.kb(kbId), rows.map((x) => KbKnowledgeEdgeRepository.toSpec(x)), {
      dedupe: 'strict',
    })
    return { created: r.created.length, deduped: r.skipped }
  }

  /** 邻域查询（PPR 展开与卡片 related 区共用）：给定节点集合的一跳边 */
  async neighborsOf(kbId: string, ids: string[]): Promise<KbEdgeRecord[]> {
    if (ids.length === 0) return []
    const idSet = new Set(ids)
    const edges = await this.store.listEdges(GraphNames.kb(kbId))
    return edges
      .filter((e) => idSet.has(e.source.id) || idSet.has(e.target.id))
      .map((e) => KbKnowledgeEdgeRepository.toRecord(e))
  }

  /** 图快照（PPR 输入；缓存与失效在 BrainQueryService，仓储只出数据） */
  async graphSnapshot(
    kbId: string,
  ): Promise<{ nodes: Array<{ id: string; kind: string }>; edges: Array<[string, string, number]> }> {
    const snap = await this.store.snapshot(GraphNames.kb(kbId))
    return {
      nodes: snap.nodes.map((n) => ({ id: n.id, kind: n.kind })),
      edges: snap.edges.map((e) => [e.source.id, e.target.id, e.confidence ?? 1]),
    }
  }

  /**
   * 孤儿边降权（代谢 v1）：端点论断已 stale/superseded 的边 confidence 减半
   * （不物理删——设计 §12 红线；置信度衰减即呈现层降权）。返回降权边数。
   * statusById 由调用方（代谢服务）查询传入——仓储不做跨仓储全局调用。
   */
  async decayOrphans(kbId: string, statusById: Map<string, string>): Promise<number> {
    const edges = await this.store.listEdges(GraphNames.kb(kbId), { relation: 'leads-to' })
    let n = 0
    for (const e of edges) {
      const stS = statusById.get(e.source.id)
      const stT = statusById.get(e.target.id)
      const orphan =
        stS === undefined || stT === undefined || stS === 'stale' || stS === 'superseded' || stT === 'stale' || stT === 'superseded'
      if (orphan && (e.confidence ?? 1) > 0.1) {
        await this.store.updateEdge(e.graphName, e.id, { confidence: (e.confidence ?? 1) * 0.5 })
        n++
      }
    }
    return n
  }

  /** 实体合并时的边端点改指（消歧协调方调用）。老表无 updated_at 语义保留：只改端点 */
  async redirectNode(fromKind: KbEdgeNodeKind, fromId: string, toId: string): Promise<number> {
    let affected = 0
    const graphs = await this.store.listGraphs(KB_PREFIX)
    for (const { graphName } of graphs) {
      const asSource = await this.store.listEdges(graphName, { source: { kind: fromKind, id: fromId } })
      for (const e of asSource) {
        if (await this.store.updateEdge(graphName, e.id, { source: { kind: fromKind, id: toId } })) affected++
      }
      const asTarget = await this.store.listEdges(graphName, { target: { kind: fromKind, id: fromId } })
      for (const e of asTarget) {
        if (await this.store.updateEdge(graphName, e.id, { target: { kind: fromKind, id: toId } })) affected++
      }
    }
    return affected
  }

  /**
   * 清上一轮体系汇聚边（v3 M2：两端均为带 attrs 体系节点的 sublevel-of/relates 边）。
   * 只动 aggregate 自产边，graph-build 的人物世界关系边不受影响。
   */
  async deleteAggregateElementEdges(kbId: string): Promise<void> {
    // 体系节点判定依赖 kb_entities.attrs（存储层不持有节点行）——在 facade 层查节点集合
    const entRows = (await this.dataSource.query(
      `SELECT id FROM kb_entities WHERE knowledge_base_id = ? AND attrs IS NOT NULL`,
      [kbId],
    )) as Array<{ id: string }>
    const sysIds = new Set(entRows.map((r) => r.id))
    if (sysIds.size === 0) return
    const edges = await this.store.listEdges(GraphNames.kb(kbId), { relation: ['sublevel-of', 'relates'] })
    for (const e of edges) {
      if (sysIds.has(e.source.id) && sysIds.has(e.target.id)) {
        await this.store.removeEdge(e.graphName, e.id)
      }
    }
  }

  /** 实体↔实体边删除（P2 图谱重建：重建前清掉上一轮抽取的关系边） */
  async deleteEntityEntityEdges(kbId: string): Promise<void> {
    await this.store.removeEdges(GraphNames.kb(kbId), { sourceKind: 'entity', targetKind: 'entity' })
  }

  /** 实体↔实体边清单（P2 图谱视图数据源，带关系/证据/置信度） */
  async listEntityEdges(
    kbId: string,
  ): Promise<Array<{ id: string; sourceId: string; relation: string; targetId: string; evidence: string; confidence: number }>> {
    const edges = await this.store.listEdges(GraphNames.kb(kbId), { sourceKind: 'entity', targetKind: 'entity' })
    return edges.map((e) => ({
      id: e.id,
      sourceId: e.source.id,
      relation: e.relation,
      targetId: e.target.id,
      evidence: e.evidence ?? '',
      confidence: e.confidence ?? 0.7,
    }))
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await this.store.removeGraph(GraphNames.kb(knowledgeBaseId))
  }

  async deleteBySourceIds(sourceKind: KbEdgeNodeKind, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    // 老签名无 kbId（按用户全域删）——遍历该用户的 kb 库逐一删，语义等价
    const graphs = await this.store.listGraphs(KB_PREFIX)
    for (const { graphName } of graphs) {
      for (const id of ids) {
        await this.store.removeEdges(graphName, { source: { kind: sourceKind, id } })
      }
    }
  }

  /** 端点作为 target 的边删除（删文档级联：atom 既可能是 source 也可能是 target） */
  async deleteByTargetIds(targetKind: KbEdgeNodeKind, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const graphs = await this.store.listGraphs(KB_PREFIX)
    for (const { graphName } of graphs) {
      for (const id of ids) {
        await this.store.removeEdges(graphName, { target: { kind: targetKind, id } })
      }
    }
  }
}
