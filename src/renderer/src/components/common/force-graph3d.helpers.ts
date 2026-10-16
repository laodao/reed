/**
 * 统一图谱能力 3D 引擎纯函数
 * @module components/common/force-graph3d.helpers
 * @description ForceGraph 3D 实现中可独立测试的逻辑抽离：邻接/度数统计、
 *              标签分级决策（治密的通用规则，长文与 Atlas 两宿主共享）、
 *              相机距离与缩放百分比换算。不依赖 DOM/WebGL，供单测覆盖。
 */
import type { ForceGraphEdge, ForceGraphNode } from './force-graph.model'

/** 无向一阶邻接表（按边集统计） */
export function buildAdjacency(edges: ForceGraphEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set())
    if (!adj.has(e.target)) adj.set(e.target, new Set())
    adj.get(e.source)!.add(e.target)
    adj.get(e.target)!.add(e.source)
  }
  return adj
}

/** 度数表（按边集统计，两端各计一次） */
export function buildDegreeMap(edges: ForceGraphEdge[]): Map<string, number> {
  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }
  return degree
}

export interface LabelRuleOptions {
  /** 可见节点数 ≤ 阈值 → 全部显示标签 */
  allThreshold?: number
  /** 超阈值时按度数保留的枢纽标签数上限 */
  hubMax?: number
}

export const DEFAULT_LABEL_ALL_THRESHOLD = 60
export const DEFAULT_LABEL_HUB_MAX = 40

/**
 * 标签分级：决定哪些节点显示名称标签（3D 密图治密的核心规则）。
 * 少（≤ allThreshold）→ 全显；多 → 焦点集（选中/悬停/其邻居）∪ 度数 Top hubMax ∪ 孤立点
 * （孤立点不参与拥挤，名字常显）。同度数按 id 升序破平，保证确定性。
 */
export function selectLabeledNodes(
  nodes: ReadonlyArray<Pick<ForceGraphNode, 'id'>>,
  edges: ForceGraphEdge[],
  focusIds: Iterable<string> = [],
  opts: LabelRuleOptions = {},
): Set<string> {
  const allThreshold = opts.allThreshold ?? DEFAULT_LABEL_ALL_THRESHOLD
  const hubMax = opts.hubMax ?? DEFAULT_LABEL_HUB_MAX
  const result = new Set<string>(focusIds)
  if (nodes.length <= allThreshold) {
    for (const n of nodes) result.add(n.id)
    return result
  }
  const degree = buildDegreeMap(edges)
  const hubs = nodes
    .map((n) => ({ id: n.id, degree: degree.get(n.id) ?? 0 }))
    .filter((n) => n.degree > 0)
    .sort((a, b) => b.degree - a.degree || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (let i = 0; i < hubs.length && i < hubMax; i++) result.add(hubs[i].id)
  for (const n of nodes) {
    if ((degree.get(n.id) ?? 0) === 0) result.add(n.id)
  }
  return result
}

/** 相机距离 → 缩放百分比（refDistance 处 = 100%，对齐 2D 读数语义） */
export function distanceToZoomPercent(distance: number, refDistance: number): number {
  if (refDistance <= 0) return 100
  return Math.round((refDistance / Math.max(distance, 1e-6)) * 100)
}

/** dolly 后的目标距离：factor > 1 = 放大 = 距离缩短；夹在 [minDistance, maxDistance] */
export function clampDollyDistance(currentDistance: number, factor: number, minDistance: number, maxDistance: number): number {
  const next = currentDistance / (factor || 1)
  return Math.min(Math.max(next, minDistance), maxDistance)
}
