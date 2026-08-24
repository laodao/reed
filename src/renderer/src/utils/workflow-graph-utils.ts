/**
 * 工作流编辑器图工具（前端）
 * @module renderer/utils/workflow-graph-utils
 * @description 变量选择器上游过滤等画布图计算（纯函数，便于单测）。
 */

/** 画布边的最小形态（Vue Flow Edge 的 source/target + data.kind） */
export interface CanvasEdgeLike {
  source: string
  target: string
  /** 出边类型（loop-back 回边不参与上游传播） */
  kind?: string
}

/**
 * 计算某节点的拓扑上游可达节点集合（不含自身）：沿入边反向 BFS。
 * 变量选择器用——只列出上游节点输出，防止引用后置环节的变量。
 * @param nodeId 当前节点 id
 * @param edges 画布全部边
 */
export function computeUpstreamNodeIds(
  nodeId: string,
  edges: CanvasEdgeLike[]
): Set<string> {
  const visited = new Set<string>()
  const queue: string[] = []
  const revAdjacency = new Map<string, CanvasEdgeLike[]>()
  for (const e of edges) {
    if (e.kind === 'loop-back') continue // loop 节点不把循环体节点视为上游
    const list = revAdjacency.get(e.target) ?? []
    list.push(e)
    revAdjacency.set(e.target, list)
  }
  for (const e of revAdjacency.get(nodeId) ?? []) queue.push(e.source)
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const e of revAdjacency.get(current) ?? []) {
      if (!visited.has(e.source)) queue.push(e.source)
    }
  }
  return visited
}
