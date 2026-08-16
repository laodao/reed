/**
 * 工作流图拓扑工具（校验器与引擎共用）
 * @module core/modules/workflow/engine/graph-topology
 * @description 可达集、循环节点 body 子图（支配节点定义）等拓扑计算的唯一实现。
 *              graph-validator 与 workflow-engine 共用——两处逻辑必须一致，
 *              否则校验放行的图引擎跑不了、或引擎跑出校验器没预见的形态。
 */

import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'

/**
 * 计算从起点出发沿满足条件的边可达的节点集合（不含起点自身）。
 * @param startNodeId 起始节点
 * @param edges 全部边
 * @param edgeFilter 边过滤（返回 false 的边不参与传播）
 * @param nodeById 节点表（终点不存在时跳过该边，容错）
 */
export function computeReachableSet(
  startNodeId: string,
  edges: WorkflowEdge[],
  edgeFilter: (e: WorkflowEdge) => boolean,
  nodeById: Map<string, WorkflowNode>
): Set<string> {
  const visited = new Set<string>()
  const queue: string[] = []
  const adjacency = new Map<string, WorkflowEdge[]>()
  for (const e of edges) {
    if (!edgeFilter(e)) continue
    const list = adjacency.get(e.sourceNodeId) ?? []
    list.push(e)
    adjacency.set(e.sourceNodeId, list)
  }
  for (const e of adjacency.get(startNodeId) ?? []) {
    if (nodeById.has(e.targetNodeId)) queue.push(e.targetNodeId)
  }
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const e of adjacency.get(current) ?? []) {
      if (nodeById.has(e.targetNodeId) && !visited.has(e.targetNodeId)) {
        queue.push(e.targetNodeId)
      }
    }
  }
  return visited
}

/** 循环体子图计算结果 */
export interface LoopBodyInfo {
  /** body 入口节点 ID（loop-body 边目标） */
  bodyEntry: string
  /** body 节点集合（支配定义：只能经由 loop-body 边进入） */
  bodySet: Set<string>
  /**
   * 入口是否被 loop-body 边支配。
   * false = 存在绕过循环节点直接进入 body 的路径（校验器报错；引擎拒绝执行）。
   */
  dominated: boolean
}

/**
 * 计算循环节点的 body 子图（支配节点定义，与 graph-validator 一致）：
 *   body = { 从 body 入口沿非 loop-back 边可达 } ∩ { 去掉本 loop-body 边后从 start 不可达 }
 * @param graph 整图
 * @param nodeById 节点表
 * @param loopNodeId 循环节点 ID
 * @param bodyEntryEdge loop-body 边（调用方保证存在且指向有效节点）
 */
export function computeLoopBody(
  graph: WorkflowGraph,
  nodeById: Map<string, WorkflowNode>,
  loopNodeId: string,
  bodyEntryEdge: WorkflowEdge
): LoopBodyInfo {
  const bodyEntry = bodyEntryEdge.targetNodeId
  const startNode = graph.nodes.find(n => n.type === 'start')
  if (!startNode) {
    // 无 start：校验器会报错；引擎侧兜底为"入口即全部 body"
    const fromEntry = computeReachableSet(
      bodyEntry,
      graph.edges,
      e => e.kind !== 'loop-back',
      nodeById
    )
    return { bodyEntry, bodySet: new Set([bodyEntry, ...fromEntry]), dominated: true }
  }

  // 去掉本循环 loop-body 边后从 start 的可达集（可绕过循环体进入的节点）
  const bypassReachable = computeReachableSet(
    startNode.id,
    graph.edges.filter(e => e !== bodyEntryEdge),
    () => true,
    nodeById
  )
  // 从 body 入口沿非 loop-back 边可达的候选集（含入口自身）
  const fromEntry = computeReachableSet(
    bodyEntry,
    graph.edges,
    e => e.kind !== 'loop-back',
    nodeById
  )
  const bodySet = new Set<string>([bodyEntry, ...fromEntry])
  for (const id of [...bodySet]) {
    if (id === startNode.id || bypassReachable.has(id)) bodySet.delete(id)
  }
  return { bodyEntry, bodySet, dominated: bodySet.has(bodyEntry) }
}

/** 构建节点表（id → node） */
export function buildNodeMap(graph: WorkflowGraph): Map<string, WorkflowNode> {
  return new Map(graph.nodes.map(n => [n.id, n]))
}

/** 某节点的全部入边 */
export function incomingEdgesOf(graph: WorkflowGraph, nodeId: string): WorkflowEdge[] {
  return graph.edges.filter(e => e.targetNodeId === nodeId)
}

/** 某节点某 kind 的出边 */
export function outgoingEdgesOf(
  graph: WorkflowGraph,
  nodeId: string,
  kind?: WorkflowEdge['kind']
): WorkflowEdge[] {
  return graph.edges.filter(
    e => e.sourceNodeId === nodeId && (kind === undefined || e.kind === kind)
  )
}
