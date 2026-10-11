/**
 * 知识大脑·语义边仓库（kb_knowledge_edges 表）
 * @module database/repositories/kb-knowledge-edge.repository
 */
import { In, type DataSource, type FindOptionsWhere } from 'typeorm'
import { randomUUID } from 'crypto'
import {
  KbKnowledgeEdgeEntity,
  type KbEdgeNodeKind,
  type KbEdgeRelation,
} from '../entities/kb-brain/kb-knowledge-edge.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

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

export class KbKnowledgeEdgeRepository extends BaseRepository<KbKnowledgeEdgeEntity, KbEdgeRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbKnowledgeEdgeEntity)
  }

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

  /**
   * 批量落边：命中唯一键（五元组）跳过并计数（幂等——同批重跑/重复萃取不产生重复边）。
   */
  async createBatch(kbId: string, rows: KbEdgeInput[]): Promise<{ created: number; deduped: number }> {
    if (rows.length === 0) return { created: 0, deduped: 0 }
    const userId = getCurrentUserId()
    const now = new Date()
    let created = 0
    let deduped = 0
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(KbKnowledgeEdgeEntity)
      for (const r of rows) {
        const existing = await repo.findOne({
          where: {
            sourceKind: r.sourceKind,
            sourceId: r.sourceId,
            relation: r.relation,
            targetKind: r.targetKind,
            targetId: r.targetId,
          } as never,
        })
        if (existing) {
          deduped++
          continue
        }
        const e = new KbKnowledgeEdgeEntity()
        e.id = randomUUID()
        e.userId = userId
        e.knowledgeBaseId = kbId
        e.sourceKind = r.sourceKind
        e.sourceId = r.sourceId
        e.relation = r.relation
        e.targetKind = r.targetKind
        e.targetId = r.targetId
        e.evidence = r.evidence
        e.confidence = r.confidence ?? 0.7
        e.origin = r.origin ?? 'ai'
        e.verified = 0
        e.createdAt = now
        await repo.save(e)
        created++
      }
    })
    return { created, deduped }
  }

  /** 邻域查询（PPR 展开与卡片 related 区共用）：给定节点集合的一跳边 */
  async neighborsOf(
    kbId: string,
    ids: string[],
  ): Promise<KbEdgeRecord[]> {
    if (ids.length === 0) return []
    const rows = await this.scoped
      .qb('e')
      .where('e.knowledge_base_id = :kbId', { kbId })
      .andWhere('(e.source_id IN (:...ids) OR e.target_id IN (:...ids))', { ids })
      .getMany()
    return this.toDtoList(rows)
  }

  /** 图快照（PPR 输入；缓存与失效在 BrainQueryService，仓储只出数据） */
  async graphSnapshot(
    kbId: string,
  ): Promise<{ nodes: Array<{ id: string; kind: string }>; edges: Array<[string, string, number]> }> {
    const entityRows = await this.scoped.find({
      where: { knowledgeBaseId: kbId } as FindOptionsWhere<KbKnowledgeEdgeEntity>,
    })
    const nodes = new Map<string, { id: string; kind: string }>()
    const edges: Array<[string, string, number]> = []
    for (const e of entityRows) {
      nodes.set(e.sourceId, { id: e.sourceId, kind: e.sourceKind })
      nodes.set(e.targetId, { id: e.targetId, kind: e.targetKind })
      edges.push([e.sourceId, e.targetId, e.confidence])
    }
    return { nodes: [...nodes.values()], edges }
  }

  /**
   * 孤儿边降权（代谢 v1）：端点论断已 stale/superseded 的边 confidence 减半
   * （不物理删——设计 §12 红线；置信度衰减即呈现层降权）。返回降权边数。
   * statusById 由调用方（代谢服务）查询传入——仓储不做跨仓储全局调用。
   */
  async decayOrphans(kbId: string, statusById: Map<string, string>): Promise<number> {
    const edges = await this.scoped.find({
      where: { knowledgeBaseId: kbId, relation: 'leads-to' } as never,
    })
    let n = 0
    for (const e of edges) {
      const stS = statusById.get(e.sourceId)
      const stT = statusById.get(e.targetId)
      const orphan =
        stS === undefined || stT === undefined || stS === 'stale' || stS === 'superseded' || stT === 'stale' || stT === 'superseded'
      if (orphan && e.confidence > 0.1) {
        await this.scoped.update({ id: e.id } as never, { confidence: e.confidence * 0.5 } as never)
        n++
      }
    }
    return n
  }

  /** 实体合并时的边端点改指（消歧协调方调用）。边表无 updated_at，只改端点 */
  async redirectNode(
    fromKind: KbEdgeNodeKind,
    fromId: string,
    toId: string,
  ): Promise<number> {
    let affected = 0
    affected += await this.scoped.update(
      { sourceKind: fromKind, sourceId: fromId } as FindOptionsWhere<KbKnowledgeEdgeEntity>,
      { sourceId: toId } as never,
    )
    affected += await this.scoped.update(
      { targetKind: fromKind, targetId: fromId } as FindOptionsWhere<KbKnowledgeEdgeEntity>,
      { targetId: toId } as never,
    )
    return affected
  }

  /** 实体↔实体边删除（P2 图谱重建：重建前清掉上一轮抽取的关系边） */
  /**
   * 图谱重建清边（graph-build 专用）：只删「世界关系白名单」内的实体边——
   * v3 真机实证：全删会连带清掉体系汇聚产线的 sublevel-of 体系树边（两条产线
   * 互不相认，四件套一跑体系树就被清空）。体系树/知识类边（sublevel-of 等）
   * 由各自产线自行演进。
   */
  /**
   * 清上一轮体系汇聚边（v3 M2：两端均为带 attrs 体系节点的 sublevel-of/relates 边）。
   * 只动 aggregate 自产边，graph-build 的人物世界关系边不受影响。
   */
  async deleteAggregateElementEdges(kbId: string): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM kb_knowledge_edges WHERE knowledge_base_id = ? AND relation IN ('sublevel-of','relates')
       AND source_id IN (SELECT id FROM kb_entities WHERE attrs IS NOT NULL AND knowledge_base_id = ?)
       AND target_id IN (SELECT id FROM kb_entities WHERE attrs IS NOT NULL AND knowledge_base_id = ?)`,
      [kbId, kbId, kbId]
    )
  }

  async deleteEntityEntityEdges(kbId: string): Promise<void> {
    await this.scoped.delete({
      knowledgeBaseId: kbId,
      sourceKind: 'entity',
      targetKind: 'entity',
      relation: In(['member-of', 'located-in', 'owns', 'wields', 'allied-with', 'enemy-of', 'kin-of', 'mentor-of', 'relates']),
    } as unknown as FindOptionsWhere<KbKnowledgeEdgeEntity>)
  }

  /** 实体↔实体边清单（P2 图谱视图数据源，带关系/证据/置信度） */
  async listEntityEdges(
    kbId: string,
  ): Promise<Array<{ id: string; sourceId: string; relation: string; targetId: string; evidence: string; confidence: number }>> {
    const rows = await this.scoped.find({
      where: {
        knowledgeBaseId: kbId,
        sourceKind: 'entity',
        targetKind: 'entity',
      } as FindOptionsWhere<KbKnowledgeEdgeEntity>,
    })
    return rows.map(r => ({
      id: r.id,
      sourceId: r.sourceId,
      relation: r.relation,
      targetId: r.targetId,
      evidence: r.evidence ?? '',
      confidence: r.confidence,
    }))
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await this.scoped.delete({ knowledgeBaseId } as FindOptionsWhere<KbKnowledgeEdgeEntity>)
  }

  async deleteBySourceIds(sourceKind: KbEdgeNodeKind, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.scoped.delete({
      sourceKind,
      sourceId: In(ids),
    } as FindOptionsWhere<KbKnowledgeEdgeEntity>)
  }

  /** 端点作为 target 的边删除（删文档级联：atom 既可能是 source 也可能是 target） */
  async deleteByTargetIds(targetKind: KbEdgeNodeKind, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.scoped.delete({
      targetKind,
      targetId: In(ids),
    } as FindOptionsWhere<KbKnowledgeEdgeEntity>)
  }
}
