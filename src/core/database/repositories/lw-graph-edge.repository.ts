/**
 * 长文写作图谱关系边仓库
 * @module database/repositories/lw-graph-edge.repository
 *
 * 【统一图存储 facade】2026-10-10 起本仓储只是 GraphStore 的长文项目图视图：
 * 存储落 graph_edges（graph_name='lw:project:{projectId}'，端点 kind=实体类型，
 * 时间线 validFrom/validUntil=章节号），老表 lw_graph_edges 停写（保留供回填/回滚）。
 * 方法签名与 DTO（@shared/types/longwriting.types GraphEdge）保持不变，调用方零改动。
 *
 * 语义保留要点：
 * - 幂等去重只看仍生效边（active-only）——「关停后重建同名关系」合法；
 * - create 撞活跃键时返回现存边（旧表无约束时会产生重复行，统一后收敛）；
 * - deleteByOriginChapter / deleteBySourceEventIds 的过滤口径原样保留。
 */

import type { DataSource } from 'typeorm'
import type {
  GraphEdge,
  GraphEntityType,
  CreateGraphEdgeRequest,
  UpdateGraphEdgeRequest,
} from '@shared/types/longwriting.types'
import type { GraphEdge as GraphEdgeDto } from '@shared/types/graph-store.types'
import { LwGraphEdgeEntity } from '../entities/lw-graph-edge.entity'
import { BaseRepository } from '../base-repository'
import { GraphNames } from '@shared/constants/graph-store'
import { GraphStoreService } from '@core/platform/services/graph/store/graph-store.service'
import { GraphEdgeRepository } from './graph-edge.repository'

const PROJECT_PREFIX = GraphNames.lwProject('') // 'lw:project:'

export class LwGraphEdgeRepository extends BaseRepository<LwGraphEdgeEntity, GraphEdge> {
  private readonly store: GraphStoreService
  private readonly edgeRepo: GraphEdgeRepository

  constructor(dataSource: DataSource) {
    super(dataSource, LwGraphEdgeEntity)
    this.store = GraphStoreService.forDataSource(dataSource)
    this.edgeRepo = new GraphEdgeRepository(dataSource)
  }

  /** 抽象方法实现（facade 后不再走老实体读取路径，仅为基类契约保留） */
  protected toDto(e: LwGraphEdgeEntity): GraphEdge {
    return {
      id: e.id,
      projectId: e.projectId,
      sourceType: e.sourceType as GraphEntityType,
      sourceId: e.sourceId,
      targetType: e.targetType as GraphEntityType,
      targetId: e.targetId,
      relationType: e.relationType,
      label: e.label ?? undefined,
      validFromChapter: e.validFromChapter ?? undefined,
      validUntilChapter: e.validUntilChapter ?? undefined,
      description: e.description ?? undefined,
      origin: this.parseOrigin(e.origin),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  private parseOrigin(raw: string | null): GraphEdge['origin'] {
    if (!raw) return undefined
    try {
      return JSON.parse(raw) as GraphEdge['origin']
    } catch {
      return undefined
    }
  }

  private static toLwEdge(e: GraphEdgeDto): GraphEdge {
    return {
      id: e.id,
      projectId: e.graphName.slice(PROJECT_PREFIX.length),
      sourceType: e.source.kind as GraphEntityType,
      sourceId: e.source.id,
      targetType: e.target.kind as GraphEntityType,
      targetId: e.target.id,
      relationType: e.relation,
      label: e.label ?? undefined,
      validFromChapter: e.validFrom ?? undefined,
      validUntilChapter: e.validUntil ?? undefined,
      description: e.description ?? undefined,
      origin: e.origin == null ? undefined : (e.origin as GraphEdge['origin']),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  private static toSpec(data: {
    sourceType: string
    sourceId: string
    targetType: string
    targetId: string
    relationType: string
    label?: string | null
    description?: string | null
    origin?: GraphEdge['origin']
    validFromChapter?: number | null
    validUntilChapter?: number | null
  }) {
    return {
      source: { kind: data.sourceType, id: data.sourceId },
      target: { kind: data.targetType, id: data.targetId },
      relation: data.relationType,
      label: data.label ?? null,
      description: data.description ?? null,
      origin: data.origin ?? null,
      validFrom: data.validFromChapter ?? null,
      validUntil: data.validUntilChapter ?? null,
    }
  }

  async getByProjectId(projectId: string): Promise<GraphEdge[]> {
    const edges = await this.store.listEdges(GraphNames.lwProject(projectId))
    return edges.map((e) => LwGraphEdgeRepository.toLwEdge(e))
  }

  async getById(id: string): Promise<GraphEdge | null> {
    const e = await this.edgeRepo.findById(id)
    if (!e || !e.graphName.startsWith(PROJECT_PREFIX)) return null
    return LwGraphEdgeRepository.toLwEdge(e)
  }

  /** 某实体的全部关系边（含已失效，供时间线展示） */
  async getByEntity(projectId: string, entityType: GraphEntityType, entityId: string): Promise<GraphEdge[]> {
    const hits = await this.store.neighbors(GraphNames.lwProject(projectId), { kind: entityType, id: entityId })
    return hits
      .map((h) => LwGraphEdgeRepository.toLwEdge(h.edge))
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  /**
   * 某实体在指定章节"生效"的边：valid_from <= N AND (valid_until IS NULL OR valid_until >= N)
   */
  async getActiveEdgesAtChapter(
    projectId: string,
    entityId: string,
    chapterNumber: number,
  ): Promise<GraphEdge[]> {
    // 老口径：source_id 或 target_id 命中（不限端点类型）+ 章节时间线过滤
    const edges = await this.store.listEdges(GraphNames.lwProject(projectId), { validAt: chapterNumber })
    return edges
      .filter((e) => e.source.id === entityId || e.target.id === entityId)
      .map((e) => LwGraphEdgeRepository.toLwEdge(e))
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  async create(data: CreateGraphEdgeRequest): Promise<GraphEdge> {
    const graph = GraphNames.lwProject(data.projectId)
    const created = await this.store.addEdge(graph, LwGraphEdgeRepository.toSpec(data))
    if (created) return LwGraphEdgeRepository.toLwEdge(created)
    // 撞活跃键（同五元组仍生效边已存在）：统一存储只留一条，返回现存边保持「总是返回一条」契约
    const existing = await this.store.listEdges(graph, {
      ...LwGraphEdgeRepository.toSpec(data),
      activeOnly: true,
    })
    return LwGraphEdgeRepository.toLwEdge(existing[0])
  }

  async batchCreate(dataList: CreateGraphEdgeRequest[]): Promise<GraphEdge[]> {
    if (dataList.length === 0) return []
    const graph = GraphNames.lwProject(dataList[0].projectId)
    const r = await this.store.addEdges(graph, dataList.map((d) => LwGraphEdgeRepository.toSpec(d)))
    return r.created.map((e) => LwGraphEdgeRepository.toLwEdge(e))
  }

  async update(id: string, data: UpdateGraphEdgeRequest): Promise<GraphEdge | null> {
    const cur = await this.edgeRepo.findById(id)
    if (!cur || !cur.graphName.startsWith(PROJECT_PREFIX)) return null
    const updated = await this.store.updateEdge(cur.graphName, id, {
      relation: data.relationType,
      label: data.label,
      validFrom: data.validFromChapter,
      validUntil: data.validUntilChapter,
      description: data.description,
    })
    return updated ? LwGraphEdgeRepository.toLwEdge(updated) : null
  }

  /**
   * 关停关系：写 valid_until_chapter（关系变化不改边，旧边标失效）
   */
  async endRelation(id: string, chapterNumber: number): Promise<GraphEdge | null> {
    const cur = await this.edgeRepo.findById(id)
    if (!cur || !cur.graphName.startsWith(PROJECT_PREFIX)) return null
    const updated = await this.store.updateEdge(cur.graphName, id, { validUntil: chapterNumber })
    return updated ? LwGraphEdgeRepository.toLwEdge(updated) : null
  }

  async delete(id: string): Promise<boolean> {
    const cur = await this.edgeRepo.findById(id)
    if (!cur || !cur.graphName.startsWith(PROJECT_PREFIX)) return false
    return this.store.removeEdge(cur.graphName, id)
  }

  /** 实体删除时级联清理其边（应用层调用） */
  async deleteByEntity(projectId: string, entityType: GraphEntityType, entityId: string): Promise<number> {
    const graph = GraphNames.lwProject(projectId)
    const asSource = await this.store.removeEdges(graph, { source: { kind: entityType, id: entityId } })
    const asTarget = await this.store.removeEdges(graph, { target: { kind: entityType, id: entityId } })
    return asSource + asTarget
  }

  /** 按事件 id 批量删除边（章节图谱重跑 = 重建时清理指向旧事件的边；事件 id 只出现在 source 侧） */
  async deleteBySourceEventIds(projectId: string, eventIds: string[]): Promise<number> {
    if (!eventIds.length) return 0
    const graph = GraphNames.lwProject(projectId)
    let n = 0
    for (const eventId of eventIds) {
      n += await this.store.removeEdges(graph, { source: { kind: 'event', id: eventId } })
    }
    return n
  }

  /** 按来源章节删除提取边（章节关系演变提取"重跑=重建"幂等，模式同伏笔 deleteExtractByChapter） */
  async deleteByOriginChapter(projectId: string, chapterNumber: number): Promise<number> {
    const rows = await this.getByProjectId(projectId)
    let n = 0
    for (const r of rows) {
      if (r.origin?.type === 'extract' && r.origin.chapter === chapterNumber) {
        if (await this.delete(r.id)) n++
      }
    }
    return n
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    return this.store.removeGraph(GraphNames.lwProject(projectId))
  }

  async countByProjectId(projectId: string): Promise<number> {
    return (await this.store.stats(GraphNames.lwProject(projectId))).edgeCount
  }
}
