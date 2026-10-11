/**
 * 统一图存储类型（docs/design/2026-10-10-unified-graph-store-design.md）
 * @module shared/types/graph-store.types
 *
 * 所有业务的「节点+边」图数据共用一张 graph_edges 物理表，按 graph_name（库名）区分。
 * 节点不归存储层管——端点是不透明引用 (kind, id)，真身是各业务实体表
 * （lw_characters / kb_entities / dl_concept…）。关系语义策略（白名单/谓词注册表）
 * 留在各模块，存储层对 relation 一视同仁。
 */

/** 端点：业务实体引用。kind 约定见 @shared/constants/graph-store.ts */
export interface GraphEndpoint {
  kind: string
  id: string
}

/**
 * 幂等去重模式：
 * - 'active-only'：只对仍生效（valid_until IS NULL）的边查重——长文语义（关系可关停后重建）
 * - 'strict'：全量查重——kb / dl 语义（五元组全局唯一）
 * - 'none'：不查重（导入/重建类管线自己保证幂等）
 */
export type GraphDedupeMode = 'active-only' | 'strict' | 'none'

export interface GraphEdgeSpec {
  source: GraphEndpoint
  target: GraphEndpoint
  /** 关系类型。自由字符串，策略校验在模块侧 */
  relation: string
  label?: string | null
  description?: string | null
  /** 「为什么相关」一句话（kb 铁律；其余模块可空） */
  evidence?: string | null
  /** 置信度 0~1（kb 边权，PPR 用；其余模块可空） */
  confidence?: number | null
  /** 人审位 */
  verified?: boolean
  /** 溯源（任意可 JSON 序列化值，如 {type:'extract', chapter:3}） */
  origin?: unknown
  /** 业务序数区间起点（lw=章节号）；NULL=起点不限 */
  validFrom?: number | null
  /** 业务序数区间终点；NULL=至今有效 */
  validUntil?: number | null
  /** 扩展属性（JSON），避免以后加列 */
  props?: Record<string, unknown> | null
}

export interface GraphEdge extends GraphEdgeSpec {
  id: string
  graphName: string
  /** 所属用户（facade 层 DTO 兼容用；业务逻辑经 BaseRepository 租户隔离，无需自行判断） */
  userId: string | null
  source: GraphEndpoint
  target: GraphEndpoint
  relation: string
  label: string | null
  description: string | null
  evidence: string | null
  confidence: number | null
  verified: boolean
  origin?: unknown
  validFrom: number | null
  validUntil: number | null
  props: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export interface EdgeFilter {
  relation?: string | string[]
  source?: GraphEndpoint
  target?: GraphEndpoint
  /** 精确端点 kind 过滤（与 source/target 的 kind+id 组合互补） */
  sourceKind?: string
  targetKind?: string
  /** 任一端 kind 命中 */
  kind?: string
  /** 时间线生效过滤：valid_from <= x 且 (valid_until 为 NULL 或 >= x) */
  validAt?: number
  verified?: boolean
  /** 只取仍生效边（valid_until IS NULL） */
  activeOnly?: boolean
}

export interface NeighborOptions {
  direction?: 'out' | 'in' | 'both'
  relations?: string[]
  validAt?: number
}

export interface NeighborHit {
  edge: GraphEdge
  neighbor: GraphEndpoint
  /** 边相对查询端点的方向 */
  direction: 'out' | 'in'
}

export interface GraphSnapshot {
  /** 去重后的全部端点（派生自边，存储层不持有节点行） */
  nodes: GraphEndpoint[]
  edges: GraphEdge[]
}

export interface PPRRequestOptions {
  /** 边权（缺省 confidence ?? 1） */
  weight?: (e: GraphEdge) => number
  damping?: number
  iterations?: number
  eps?: number
}

export interface PPRHit {
  endpoint: GraphEndpoint
  score: number
}

export interface GraphStat {
  graphName: string
  edgeCount: number
  byRelation: Record<string, number>
  byKind: Record<string, number>
}

export interface AddEdgesResult {
  created: GraphEdge[]
  /** 因幂等去重被跳过的条数（含批内重复） */
  skipped: number
}
