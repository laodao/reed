/**
 * 统一图存储服务（docs/design/2026-10-10-unified-graph-store-design.md §5）
 * @module platform/services/graph/store/graph-store.service
 *
 * 基础功能模块：所有业务的「节点+边」图数据共用一张 graph_edges 表，按库名（graph_name）
 * 区分。对外提供统一的边 CRUD / 幂等批量 / 邻域 / 可达（判环）/ 快照 / PPR 接口。
 *
 * 职责边界：
 * - 只管边。节点真身在各业务实体表，端点是不透明引用 (kind, id)，不做 FK 校验。
 * - 只管存储与查询。关系语义策略（kb 关系白名单、lw 谓词注册表归一、名称→ID 解析、
 *   AI 抽取管线）留在各模块，在调用本服务之前执行。
 * - 多租户：底层 GraphEdgeRepository 继承 BaseRepository，按 ALS user 自动隔离。
 */

import type { DataSource } from 'typeorm'
import { getCoreDatabaseManager, type ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { GraphEdgeRepository, type GraphEdgePatch } from '@core/database/repositories/graph-edge.repository'
import { newGraphEdgeId } from '@core/database/repositories/graph-edge.repository'
import { personalizedPageRank } from '../ppr'
import type {
  AddEdgesResult,
  EdgeFilter,
  GraphDedupeMode,
  GraphEdge,
  GraphEdgeSpec,
  GraphEndpoint,
  GraphSnapshot,
  GraphStat,
  NeighborHit,
  NeighborOptions,
  PPRHit,
  PPRRequestOptions,
} from '@shared/types/graph-store.types'

export interface GraphStoreOptions {
  db?: ICoreDatabaseManager | null
}

export class GraphStoreService {
  private readonly dbOverride: ICoreDatabaseManager | null

  /** 测试/依赖注入用：传入 dbManager；默认取全局 */
  constructor(opts?: GraphStoreOptions) {
    this.dbOverride = opts?.db ?? null
  }

  /** 旧仓储 facade 过渡期工厂：同一 DataSource 上包出独立 store 实例（切换完成后拆除） */
  static forDataSource(ds: DataSource): GraphStoreService {
    return new GraphStoreService({
      db: { graphEdges: new GraphEdgeRepository(ds) } as unknown as ICoreDatabaseManager,
    })
  }

  private repo(): GraphEdgeRepository {
    const m = this.dbOverride ?? getCoreDatabaseManager()
    const repo = m?.graphEdges
    if (!repo) throw new Error('[GraphStore] graphEdges 仓库未装配（数据库尚未初始化）')
    return repo
  }

  // ==================== 写 ====================

  /** 五元组幂等键（批内/跨批共用；不含 graph——同一调用内 graph 恒定） */
  private tupleKey(e: Pick<GraphEdgeSpec, 'source' | 'target' | 'relation'>): string {
    return `${e.source.kind}:${e.source.id}|${e.relation}|${e.target.kind}:${e.target.id}`
  }

  private rowInput(
    graph: string,
    spec: GraphEdgeSpec,
    id: string,
    now: number,
  ): Parameters<GraphEdgeRepository['insertRows']>[0][number] {
    return {
      id,
      graphName: graph,
      sourceKind: spec.source.kind,
      sourceId: spec.source.id,
      targetKind: spec.target.kind,
      targetId: spec.target.id,
      relation: spec.relation,
      label: spec.label ?? null,
      description: spec.description ?? null,
      evidence: spec.evidence ?? null,
      confidence: spec.confidence ?? null,
      verified: spec.verified ? 1 : 0,
      origin: spec.origin == null ? null : JSON.stringify(spec.origin),
      validFrom: spec.validFrom ?? null,
      validUntil: spec.validUntil ?? null,
      props: spec.props == null ? null : JSON.stringify(spec.props),
      createdAt: now,
      updatedAt: now,
    }
  }

  /**
   * 幂等批量建边（收口 lw keySet 去重与 kb createBatch 事务查重两套实现）。
   * - 批内按五元组去重 + 库内按 dedupe 模式去重，跳过计数进 skipped；
   * - 'active-only' 只对仍生效边查重（lw：关系可关停后重建）；'strict' 全量查重；'none' 不查。
   */
  async addEdges(
    graph: string,
    specs: GraphEdgeSpec[],
    opts?: { dedupe?: GraphDedupeMode },
  ): Promise<AddEdgesResult> {
    if (specs.length === 0) return { created: [], skipped: 0 }
    const mode = opts?.dedupe ?? 'active-only'

    let existingKeys: Set<string> | null = null
    if (mode !== 'none') {
      const existing = await this.repo().findByGraph(graph, mode === 'active-only' ? { activeOnly: true } : undefined)
      existingKeys = new Set(existing.map((e) => this.tupleKey(e)))
    }

    const now = Date.now()
    const rows: Parameters<GraphEdgeRepository['insertRows']>[0] = []
    const createdIds: string[] = []
    let skipped = 0
    const batchSeen = new Set<string>()
    for (const spec of specs) {
      const key = this.tupleKey(spec)
      if (existingKeys?.has(key) || batchSeen.has(key)) {
        skipped++
        continue
      }
      batchSeen.add(key)
      const id = newGraphEdgeId()
      rows.push(this.rowInput(graph, spec, id, now))
      createdIds.push(id)
    }
    await this.repo().insertRows(rows)
    const created = await this.repo().findByIds(graph, createdIds)
    const byId = new Map(created.map((e) => [e.id, e]))
    return { created: createdIds.map((id) => byId.get(id)).filter((e): e is GraphEdge => !!e), skipped }
  }

  /** 单条建边（语义同 addEdges dedupe 模式；重复时返回 null 并由调用方决定处理） */
  async addEdge(
    graph: string,
    spec: GraphEdgeSpec,
    opts?: { dedupe?: GraphDedupeMode },
  ): Promise<GraphEdge | null> {
    const { created } = await this.addEdges(graph, [spec], opts)
    return created[0] ?? null
  }

  /** 局部更新（端点/关系/载荷均可改；kb 实体合并 redirectNode 语义在此实现） */
  async updateEdge(graph: string, edgeId: string, patch: Partial<GraphEdgeSpec>): Promise<GraphEdge | null> {
    const rowPatch: GraphEdgePatch = {}
    if (patch.source !== undefined) {
      rowPatch.sourceKind = patch.source.kind
      rowPatch.sourceId = patch.source.id
    }
    if (patch.target !== undefined) {
      rowPatch.targetKind = patch.target.kind
      rowPatch.targetId = patch.target.id
    }
    if (patch.relation !== undefined) rowPatch.relation = patch.relation
    if (patch.label !== undefined) rowPatch.label = patch.label
    if (patch.description !== undefined) rowPatch.description = patch.description
    if (patch.evidence !== undefined) rowPatch.evidence = patch.evidence
    if (patch.confidence !== undefined) rowPatch.confidence = patch.confidence
    if (patch.verified !== undefined) rowPatch.verified = patch.verified ? 1 : 0
    if (patch.origin !== undefined) rowPatch.origin = patch.origin == null ? null : JSON.stringify(patch.origin)
    if (patch.validFrom !== undefined) rowPatch.validFrom = patch.validFrom
    if (patch.validUntil !== undefined) rowPatch.validUntil = patch.validUntil
    if (patch.props !== undefined) rowPatch.props = patch.props == null ? null : JSON.stringify(patch.props)
    return this.repo().updateRow(graph, edgeId, rowPatch)
  }

  /** 删单条（graph 必须匹配才删——防跨库误删） */
  async removeEdge(graph: string, edgeId: string): Promise<boolean> {
    const edge = await this.repo().getById(graph, edgeId)
    if (!edge) return false
    return (await this.repo().deleteByIds([edge.id])) > 0
  }

  /** 批量删（按过滤条件；返回删除条数） */
  async removeEdges(graph: string, filter?: EdgeFilter): Promise<number> {
    const ids = await this.repo().findIdsByFilter(graph, filter)
    return this.repo().deleteByIds(ids)
  }

  /** 按库名级联删整个图（purge 用；返回删除条数） */
  async removeGraph(graph: string): Promise<number> {
    return this.removeEdges(graph)
  }

  // ==================== 读 ====================

  async getEdge(graph: string, edgeId: string): Promise<GraphEdge | null> {
    return this.repo().getById(graph, edgeId)
  }

  async listEdges(graph: string, filter?: EdgeFilter): Promise<GraphEdge[]> {
    return this.repo().findByGraph(graph, filter)
  }

  /** 一跳邻域（出/入/双向；kb neighborsOf 与 dl neighbors 的统一收口） */
  async neighbors(
    graph: string,
    endpoint: GraphEndpoint,
    opts?: NeighborOptions,
  ): Promise<NeighborHit[]> {
    const direction = opts?.direction ?? 'both'
    const filter: EdgeFilter = {
      relation: opts?.relations,
      validAt: opts?.validAt,
    }
    const edges: GraphEdge[] = []
    if (direction === 'out' || direction === 'both') {
      edges.push(...(await this.repo().findByGraph(graph, { ...filter, source: endpoint })))
    }
    if (direction === 'in' || direction === 'both') {
      edges.push(...(await this.repo().findByGraph(graph, { ...filter, target: endpoint })))
    }
    // 自环边（source===target）在双向查询会命中两次，按 id 去重
    const seen = new Set<string>()
    const deduped = edges.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    return deduped.map((edge) => {
      const isOut = edge.source.id === endpoint.id && edge.source.kind === endpoint.kind
      return {
        edge,
        neighbor: isOut ? edge.target : edge.source,
        direction: isOut ? ('out' as const) : ('in' as const),
      }
    })
  }

  /** 图快照（PPR 输入 / 图视图数据源；kb graphSnapshot 与 handler 取数收口） */
  async snapshot(graph: string, filter?: EdgeFilter): Promise<GraphSnapshot> {
    const edges = await this.repo().findByGraph(graph, filter)
    const nodeKeys = new Map<string, GraphEndpoint>()
    for (const e of edges) {
      nodeKeys.set(`${e.source.kind}:${e.source.id}`, e.source)
      nodeKeys.set(`${e.target.kind}:${e.target.id}`, e.target)
    }
    return { nodes: [...nodeKeys.values()], edges }
  }

  // ==================== 算法 ====================

  private static nodeKey(e: GraphEndpoint): string {
    return `${e.kind}:${e.id}`
  }

  /**
   * 可达性（BFS）：从 start 出发沿边可达的端点 key 集合（不含 start 自身，除非成环可达）。
   * dl 前置判环（wouldCreatePrereqCycle 的图存储收口）：加边 (from→to) 前查 reachable(to) 是否含 from。
   */
  async reachable(
    graph: string,
    start: GraphEndpoint,
    opts?: NeighborOptions,
  ): Promise<Set<string>> {
    const direction = opts?.direction ?? 'out'
    const visited = new Set<string>()
    const queue: GraphEndpoint[] = [start]
    const startKey = GraphStoreService.nodeKey(start)
    while (queue.length > 0) {
      const cur = queue.shift() as GraphEndpoint
      const hits = await this.neighbors(graph, cur, { ...opts, direction })
      for (const hit of hits) {
        const key = GraphStoreService.nodeKey(hit.neighbor)
        if (visited.has(key) || key === startKey) continue
        visited.add(key)
        queue.push(hit.neighbor)
      }
    }
    return visited
  }

  /** 最短路径（BFS；返回节点 key 序列含首尾；不可达返回 null） */
  async findPath(
    graph: string,
    from: GraphEndpoint,
    to: GraphEndpoint,
    opts?: NeighborOptions,
  ): Promise<string[] | null> {
    const startKey = GraphStoreService.nodeKey(from)
    const goalKey = GraphStoreService.nodeKey(to)
    if (startKey === goalKey) return [startKey]
    const parent = new Map<string, string>()
    const queue: GraphEndpoint[] = [from]
    const visited = new Set([startKey])
    while (queue.length > 0) {
      const cur = queue.shift() as GraphEndpoint
      for (const hit of await this.neighbors(graph, cur, opts)) {
        const key = GraphStoreService.nodeKey(hit.neighbor)
        if (visited.has(key)) continue
        visited.add(key)
        parent.set(key, GraphStoreService.nodeKey(cur))
        if (key === goalKey) {
          const path = [key]
          let p: string | undefined = key
          while ((p = parent.get(p))) path.unshift(p)
          return path
        }
        queue.push(hit.neighbor)
      }
    }
    return null
  }

  /**
   * Personalized PageRank（包装平台层纯函数 ppr.ts）。
   * 边权缺省 confidence ?? 1（kb 边权语义；lw 边等权）。返回按分数降序的端点列表。
   */
  async ppr(
    graph: string,
    seeds: Array<{ endpoint: GraphEndpoint; weight: number }>,
    opts?: PPRRequestOptions,
  ): Promise<PPRHit[]> {
    const snap = await this.snapshot(graph)
    if (snap.edges.length === 0 || seeds.length === 0) return []
    const weight = opts?.weight ?? ((e: GraphEdge) => e.confidence ?? 1)
    const seedMap = new Map<string, number>()
    for (const s of seeds) seedMap.set(GraphStoreService.nodeKey(s.endpoint), s.weight)
    const scores = personalizedPageRank(
      {
        nodes: snap.nodes.map((n) => GraphStoreService.nodeKey(n)),
        edges: snap.edges.map((e) => [
          GraphStoreService.nodeKey(e.source),
          GraphStoreService.nodeKey(e.target),
          Math.max(0, weight(e)),
        ]),
      },
      seedMap,
      { damping: opts?.damping, iterations: opts?.iterations, eps: opts?.eps },
    )
    const byKey = new Map(snap.nodes.map((n) => [GraphStoreService.nodeKey(n), n]))
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, score]) => ({ endpoint: byKey.get(key) as GraphEndpoint, score }))
  }

  // ==================== 运维 ====================

  /** 库名清单（DISTINCT 派生，无 registry 表）；prefix 可选前缀过滤 */
  async listGraphs(prefix?: string): Promise<Array<{ graphName: string; edgeCount: number }>> {
    return this.repo().listGraphs(prefix)
  }

  /** 库内统计（图视图概览/测试断言用） */
  async stats(graph: string): Promise<GraphStat> {
    const [{ byRelation, byKind }, edgeCount] = await Promise.all([
      this.repo().stats(graph),
      this.repo().countByGraph(graph),
    ])
    return { graphName: graph, edgeCount, byRelation, byKind }
  }
}

let defaultInstance: GraphStoreService | null = null

/** 全局单例（业务模块入口；测试里自行 new GraphStoreService({ db }) 注入） */
export function getGraphStore(): GraphStoreService {
  if (!defaultInstance) defaultInstance = new GraphStoreService()
  return defaultInstance
}
