/**
 * 工作流编辑器：选中高亮计算（纯函数，便于单测）
 *
 * 规则：
 * - 选中节点 → 高亮与之相连的所有边 + 这些边另一端的节点
 * - 选中边 → 高亮边自身 + 两端的节点
 * - 无选中 → 空集合
 *
 * 输出顺序稳定：节点/边均按「边遍历顺序」首次出现排列，节点去重。
 */

/** 当前选中对象（节点或边）；null = 无选中 */
export type HighlightSelection =
  | { kind: 'node'; nodeId: string }
  | { kind: 'edge'; edgeId: string; source: string; target: string }
  | null

export interface HighlightResult {
  /** 需高亮的节点 id（不含主选中节点自身；按边遍历顺序、去重） */
  nodeIds: string[]
  /** 需高亮的边 id（按输入顺序） */
  edgeIds: string[]
}

export function computeHighlight(
  sel: HighlightSelection,
  edges: Array<{ id: string; source: string; target: string }>,
): HighlightResult {
  const nodeIds: string[] = []
  const edgeIds: string[] = []
  const seenNodes = new Set<string>()
  const seenEdges = new Set<string>()
  const pushNode = (id: string): void => {
    if (seenNodes.has(id)) return
    seenNodes.add(id)
    nodeIds.push(id)
  }
  const pushEdge = (id: string): void => {
    if (seenEdges.has(id)) return
    seenEdges.add(id)
    edgeIds.push(id)
  }

  if (sel?.kind === 'edge') {
    pushEdge(sel.edgeId)
    pushNode(sel.source)
    pushNode(sel.target)
  } else if (sel?.kind === 'node') {
    for (const e of edges) {
      if (e.source !== sel.nodeId && e.target !== sel.nodeId) continue
      pushEdge(e.id)
      pushNode(e.source === sel.nodeId ? e.target : e.source)
    }
  }
  return { nodeIds, edgeIds }
}

/** 关联高亮强调色（amber），覆盖边的类型色并加粗 */
export const EDGE_HIGHLIGHT_STYLE: Readonly<Record<string, string | number>> = { stroke: '#f59e0b', strokeWidth: 3 }
