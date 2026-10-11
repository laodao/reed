/**
 * 统一图存储·边仓库（graph_edges 表）
 * @module database/repositories/graph-edge.repository
 * @description 基于 TypeORM 实现，全部读写走 this.scoped.*（user_id 多租户隔离）。
 *              五套业务图共用本表，按 graph_name（库名）区分；关系语义策略在模块侧。
 */

import type { DataSource, SelectQueryBuilder } from 'typeorm'
import { In } from 'typeorm'
import type {
  EdgeFilter,
  GraphEdge,
} from '@shared/types/graph-store.types'
import { GraphEdgeEntity } from '../entities/graph/graph-edge.entity'
import { BaseRepository } from '../base-repository'
import { randomUUID } from 'crypto'

/** 原始行输入（JSON 列为已序列化字符串；userId 由 scoped API 按 ALS 注入） */
export interface GraphEdgeRowInput {
  id: string
  graphName: string
  sourceKind: string
  sourceId: string
  targetKind: string
  targetId: string
  relation: string
  label?: string | null
  description?: string | null
  evidence?: string | null
  confidence?: number | null
  verified?: number
  /** 已序列化 JSON 文本 */
  origin?: string | null
  validFrom?: number | null
  validUntil?: number | null
  /** 已序列化 JSON 文本 */
  props?: string | null
  createdAt?: number
  updatedAt?: number
}

/** 可更新字段子集（端点也可改——kb 实体合并 redirectNode 语义） */
export type GraphEdgePatch = Partial<Omit<GraphEdgeRowInput, 'id' | 'graphName' | 'createdAt'>>

export class GraphEdgeRepository extends BaseRepository<GraphEdgeEntity, GraphEdge> {
  constructor(dataSource: DataSource) {
    super(dataSource, GraphEdgeEntity)
  }

  protected toDto(e: GraphEdgeEntity): GraphEdge {
    return {
      id: e.id,
      graphName: e.graphName,
      userId: e.userId,
      source: { kind: e.sourceKind, id: e.sourceId },
      target: { kind: e.targetKind, id: e.targetId },
      relation: e.relation,
      label: e.label ?? null,
      description: e.description ?? null,
      evidence: e.evidence ?? null,
      confidence: e.confidence ?? null,
      verified: e.verified === 1,
      origin: this.parseJson(e.origin),
      validFrom: e.validFrom ?? null,
      validUntil: e.validUntil ?? null,
      props: this.parseJson(e.props) as Record<string, unknown> | null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  private parseJson(raw: string | null): unknown {
    if (raw == null) return null
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  /** filter → qb 条件（find 与 delete 共用） */
  private applyFilter(
    qb: SelectQueryBuilder<GraphEdgeEntity>,
    graphName: string,
    filter?: EdgeFilter,
  ): void {
    qb.where('e.graph_name = :g', { g: graphName })
    if (!filter) return
    const relations = filter.relation == null ? null : Array.isArray(filter.relation) ? filter.relation : [filter.relation]
    if (relations && relations.length > 0) qb.andWhere('e.relation IN (:...rels)', { rels: relations })
    if (filter.source) {
      qb.andWhere('e.source_kind = :sk AND e.source_id = :sid', { sk: filter.source.kind, sid: filter.source.id })
    }
    if (filter.target) {
      qb.andWhere('e.target_kind = :tk AND e.target_id = :tid', { tk: filter.target.kind, tid: filter.target.id })
    }
    if (filter.sourceKind) {
      qb.andWhere('e.source_kind = :skk', { skk: filter.sourceKind })
    }
    if (filter.targetKind) {
      qb.andWhere('e.target_kind = :tkk', { tkk: filter.targetKind })
    }
    if (filter.kind) {
      qb.andWhere('(e.source_kind = :k OR e.target_kind = :k)', { k: filter.kind })
    }
    if (filter.validAt != null) {
      qb.andWhere('(e.valid_from IS NULL OR e.valid_from <= :va)', { va: filter.validAt })
      qb.andWhere('(e.valid_until IS NULL OR e.valid_until >= :va)', { va: filter.validAt })
    }
    if (filter.verified != null) {
      qb.andWhere('e.verified = :v', { v: filter.verified ? 1 : 0 })
    }
    if (filter.activeOnly) {
      qb.andWhere('e.valid_until IS NULL')
    }
  }

  async findByGraph(graphName: string, filter?: EdgeFilter): Promise<GraphEdge[]> {
    const qb = this.scoped.qb('e')
    this.applyFilter(qb, graphName, filter)
    qb.orderBy('e.created_at', 'ASC')
    return this.toDtoList(await qb.getMany())
  }

  /** 过滤条件命中的边 id（删除前先取 id，避免维护两套 DeleteQueryBuilder 条件） */
  async findIdsByFilter(graphName: string, filter?: EdgeFilter): Promise<string[]> {
    const qb = this.scoped.qb('e')
    this.applyFilter(qb, graphName, filter)
    const rows = await qb.select(['e.id']).getMany()
    return rows.map((r) => r.id)
  }

  async insertRows(rows: GraphEdgeRowInput[]): Promise<void> {
    if (rows.length === 0) return
    await this.scopedTx(async (tx) => {
      const api = tx.for(GraphEdgeEntity)
      for (const r of rows) {
        await api.insert({
          id: r.id,
          graphName: r.graphName,
          sourceKind: r.sourceKind,
          sourceId: r.sourceId,
          targetKind: r.targetKind,
          targetId: r.targetId,
          relation: r.relation,
          label: r.label ?? null,
          description: r.description ?? null,
          evidence: r.evidence ?? null,
          confidence: r.confidence ?? null,
          verified: r.verified ?? 0,
          origin: r.origin ?? null,
          validFrom: r.validFrom ?? null,
          validUntil: r.validUntil ?? null,
          props: r.props ?? null,
          createdAt: r.createdAt ?? Date.now(),
          updatedAt: r.updatedAt ?? r.createdAt ?? Date.now(),
        } as Partial<GraphEdgeEntity>)
      }
    })
  }

  async getById(graphName: string, id: string): Promise<GraphEdge | null> {
    const e = await this.scoped.findOne({ id, graphName } as never)
    return e ? this.toDto(e) : null
  }

  /** 按边 id 查（不限库名；边 id 全局唯一。facade 更新/删除前定位所属库用） */
  async findById(id: string): Promise<GraphEdge | null> {
    const e = await this.scoped.findOne({ id } as never)
    return e ? this.toDto(e) : null
  }

  async findByIds(graphName: string, ids: string[]): Promise<GraphEdge[]> {
    if (ids.length === 0) return []
    const rows = await this.scoped.find({ where: { graphName, id: In(ids) } as never })
    return this.toDtoList(rows)
  }

  async updateRow(graphName: string, id: string, patch: GraphEdgePatch): Promise<GraphEdge | null> {
    const existing = await this.scoped.findOne({ id, graphName } as never)
    if (!existing) return null
    if (patch.sourceKind !== undefined) existing.sourceKind = patch.sourceKind
    if (patch.sourceId !== undefined) existing.sourceId = patch.sourceId
    if (patch.targetKind !== undefined) existing.targetKind = patch.targetKind
    if (patch.targetId !== undefined) existing.targetId = patch.targetId
    if (patch.relation !== undefined) existing.relation = patch.relation
    if (patch.label !== undefined) existing.label = patch.label
    if (patch.description !== undefined) existing.description = patch.description
    if (patch.evidence !== undefined) existing.evidence = patch.evidence
    if (patch.confidence !== undefined) existing.confidence = patch.confidence
    if (patch.verified !== undefined) existing.verified = patch.verified
    if (patch.origin !== undefined) existing.origin = patch.origin
    if (patch.validFrom !== undefined) existing.validFrom = patch.validFrom
    if (patch.validUntil !== undefined) existing.validUntil = patch.validUntil
    if (patch.props !== undefined) existing.props = patch.props
    existing.updatedAt = Date.now()
    await this.scoped.save(existing)
    return this.toDto(existing)
  }

  async deleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    return this.scoped.delete({ id: In(ids) } as never)
  }

  async countByGraph(graphName: string): Promise<number> {
    return this.scoped.count({ graphName } as never)
  }

  /** 库名清单（DISTINCT 派生，无 registry 表）：prefix 可选前缀过滤 */
  async listGraphs(prefix?: string): Promise<Array<{ graphName: string; edgeCount: number }>> {
    const qb = this.scoped.qb('e')
    qb.select('e.graph_name', 'graphName').addSelect('COUNT(*)', 'edgeCount')
    if (prefix) qb.andWhere('e.graph_name LIKE :p', { p: `${prefix}%` })
    qb.groupBy('e.graph_name')
    const rows = await qb.getRawMany<{ graphName: string; edgeCount: string | number }>()
    return rows.map((r) => ({ graphName: r.graphName, edgeCount: Number(r.edgeCount) }))
  }

  /** 库内统计（关系分布 / 端点 kind 分布） */
  async stats(graphName: string): Promise<{ byRelation: Record<string, number>; byKind: Record<string, number> }> {
    const byRelationRows = await this.scoped
      .qb('e')
      .select('e.relation', 'relation')
      .addSelect('COUNT(*)', 'n')
      .where('e.graph_name = :g', { g: graphName })
      .groupBy('e.relation')
      .getRawMany<{ relation: string; n: string | number }>()
    const byKindRows = await this.scoped
      .qb('e')
      .select('e.source_kind', 'k')
      .addSelect('COUNT(*)', 'n')
      .where('e.graph_name = :g', { g: graphName })
      .groupBy('e.source_kind')
      .getRawMany<{ k: string; n: string | number }>()
    const byKindTarget = await this.scoped
      .qb('e')
      .select('e.target_kind', 'k')
      .addSelect('COUNT(*)', 'n')
      .where('e.graph_name = :g', { g: graphName })
      .groupBy('e.target_kind')
      .getRawMany<{ k: string; n: string | number }>()
    const byRelation: Record<string, number> = {}
    for (const r of byRelationRows) byRelation[r.relation] = Number(r.n)
    const byKind: Record<string, number> = {}
    for (const r of [...byKindRows, ...byKindTarget]) byKind[r.k] = (byKind[r.k] ?? 0) + Number(r.n)
    return { byRelation, byKind }
  }

  /** 全库边数（运维/测试用） */
  async countAll(): Promise<number> {
    return this.scoped.count({})
  }
}

/** 生成边 id（存储层统一 UUID；迁移回填保留原 id 不走这里） */
export function newGraphEdgeId(): string {
  return randomUUID()
}
