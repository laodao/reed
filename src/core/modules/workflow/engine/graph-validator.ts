/**
 * 工作流图校验器
 * @module core/modules/workflow/engine/graph-validator
 * @description 图结构合法性校验（编辑器保存/发布时与引擎启动前共用）。
 *
 *              校验分两级：
 *              - errors：阻断发布/运行的结构性问题
 *              - warnings：非阻断提示（如不可达节点，允许草稿态存在）
 *
 *              实施的语义规则（详见 workflow.types.ts 头部注释）：
 *              1. 恰好一个 start，start 无入边
 *              2. 边引用的节点必须存在；重复边报错
 *              3. 出边类型必须符合节点目录（NODE_TYPE_CATALOG.ports）的约束；
 *                 出边数量不超端口 max
 *              4. 显式并行：非 parallel 节点 normal 出边最多 1 条
 *              5. branch 出边必须源自 condition 节点、携带 branchId 且在 config.branches 声明；
 *                 同一 branchId 只允许一条出边
 *              6. loop 节点必须恰好 1 条 loop-body + 1 条 loop-done 出边
 *              7. loop-back 边必须指向所属循环节点；循环体（body）内节点的非 loop-back
 *                 出边禁止逃逸到 body 外；body 内不允许出现 loop 节点（V1 不支持嵌套）
 *              8. 除 loop-back 外不允许任何环
 *              9. 从 start 不可达的节点产生 warning
 */

import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowValidationResult,
} from '@shared/types/workflow.types'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'

/** 可选的节点配置校验钩子（引擎启动前由 NodeRegistry 注入 handler.validateConfig） */
export interface ValidateGraphOptions {
  /** 返回该节点 config 的错误信息（空数组=通过）；不提供则跳过 config 深度校验 */
  validateNodeConfig?: (node: WorkflowNode) => string[]
}

/**
 * 校验工作流图。
 * 纯函数、无副作用——同一输入恒返回同一结果，可安全用于编辑器实时校验。
 */
export function validateGraph(
  graph: WorkflowGraph,
  options?: ValidateGraphOptions
): WorkflowValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const addError = (msg: string) => errors.push(msg)
  const addWarning = (msg: string) => warnings.push(msg)

  // ---------- 0. 基本形态 ----------
  if (!graph || graph.version !== 1) {
    addError(`图格式版本不支持（当前 ${graph?.version}，需要 1）`)
    return { valid: false, errors, warnings }
  }
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    addError('图中没有任何节点')
    return { valid: false, errors, warnings }
  }
  const edges: WorkflowEdge[] = Array.isArray(graph.edges) ? graph.edges : []

  // ---------- 1. 节点表：id 唯一性、类型已知 ----------
  const nodeById = new Map<string, WorkflowNode>()
  for (const node of graph.nodes) {
    if (nodeById.has(node.id)) {
      addError(`节点 ID 重复：${node.id}`)
      continue
    }
    nodeById.set(node.id, node)
    if (!NODE_TYPE_CATALOG_MAP[node.type as keyof typeof NODE_TYPE_CATALOG_MAP]) {
      addError(`未知节点类型：${node.type}（节点 ${node.id}）`)
    }
  }

  // ---------- 2. start 约束 ----------
  const startNodes = graph.nodes.filter(n => n.type === 'start')
  if (startNodes.length === 0) {
    addError('缺少 start 节点')
  } else if (startNodes.length > 1) {
    addError(`只能有一个 start 节点（当前 ${startNodes.length} 个）`)
  }

  // ---------- 3. 边引用与重复检测 ----------
  const edgeSeen = new Set<string>()
  for (const edge of edges) {
    if (!nodeById.has(edge.sourceNodeId)) {
      addError(`边的源节点不存在：${edge.sourceNodeId}`)
      continue
    }
    if (!nodeById.has(edge.targetNodeId)) {
      addError(`边的目标节点不存在：${edge.targetNodeId}`)
      continue
    }
    const dedupeKey = [edge.sourceNodeId, edge.targetNodeId, edge.kind, edge.branchId ?? ''].join(
      '|'
    )
    if (edgeSeen.has(dedupeKey)) {
      addError(
        `重复边：${edge.sourceNodeId} →(${edge.kind}) ${edge.targetNodeId}`
      )
      continue
    }
    edgeSeen.add(dedupeKey)
  }

  /** 某节点某 kind 的出边列表 */
  const outgoingOf = (nodeId: string, kind?: WorkflowEdgeKindOf) => {
    if (kind === undefined) {
      return edges.filter(e => e.sourceNodeId === nodeId)
    }
    return edges.filter(e => e.sourceNodeId === nodeId && e.kind === kind)
  }
  /** 某节点的入边列表 */
  const incomingOf = (nodeId: string) => edges.filter(e => e.targetNodeId === nodeId)

  // start 不得有入边
  for (const s of startNodes) {
    if (incomingOf(s.id).length > 0) {
      addError(`start 节点（${s.id}）不允许有入边`)
    }
  }

  // ---------- 4. 出边类型与数量约束（按节点目录 ports） ----------
  for (const node of graph.nodes) {
    const catalog = NODE_TYPE_CATALOG_MAP[node.type as keyof typeof NODE_TYPE_CATALOG_MAP]
    if (!catalog) continue // 未知类型已在步骤 1 报错

    // 汇总本节点非 loop-back 出边按 kind 分组
    const byKind = new Map<WorkflowEdgeKindOf, WorkflowEdge[]>()
    for (const e of outgoingOf(node.id)) {
      if (e.kind === 'loop-back') continue // 单独由循环体规则校验
      const list = byKind.get(e.kind) ?? []
      list.push(e)
      byKind.set(e.kind, list)
    }

    const allowedKinds = new Set(catalog.ports.map(p => p.kind))
    // kind 合法性
    for (const [kind, list] of byKind) {
      if (!allowedKinds.has(kind)) {
        addError(`节点 ${node.id}（${catalog.label}）不允许 ${kind} 类型出边`)
      }
    }
    // required / max
    for (const port of catalog.ports) {
      const list = byKind.get(port.kind) ?? []
      if (list.length === 0 && port.required) {
        addError(`节点 ${node.id}（${catalog.label}）缺少必需的「${port.label}」(${port.kind}) 出边`)
      }
      const max = port.max ?? 1
      if (max !== -1 && list.length > max) {
        addError(
          `节点 ${node.id}（${catalog.label}）的「${port.label}」(${port.kind}) 出边最多 ${max} 条（当前 ${list.length} 条）`
        )
      }
    }
  }

  // ---------- 5. branch 出边细节 ----------
  for (const edge of edges.filter(e => e.kind === 'branch')) {
    const source = nodeById.get(edge.sourceNodeId)
    if (!source) continue
    if (source.type !== 'condition') {
      addError(`branch 出边只能来自条件分支节点（${source.id} 是 ${source.type}）`)
      continue
    }
    if (!edge.branchId) {
      addError(`条件分支 ${source.id} 的 branch 出边缺少 branchId`)
      continue
    }
    const branches = (source.config as { branches?: Array<{ branchId: string }> }).branches ?? []
    if (!branches.some(b => b.branchId === edge.branchId)) {
      addError(`branchId「${edge.branchId}」未在节点 ${source.id} 的分支配置中声明`)
    }
  }
  // 同一 branchId 只允许一条出边（显式并行原则）
  for (const node of graph.nodes.filter(n => n.type === 'condition')) {
    const seen = new Map<string, number>()
    for (const e of outgoingOf(node.id, 'branch')) {
      seen.set(e.branchId ?? '', (seen.get(e.branchId ?? '') ?? 0) + 1)
    }
    for (const [branchId, count] of seen) {
      if (count > 1) {
        addError(`分支「${branchId}」接了 ${count} 条出边（每个分支只允许一条，扇出请用并行节点）`)
      }
    }
  }

  // ---------- 6. 循环体规则（支配节点定义） ----------
  /**
   * body 子图定义（防歧义的关键）：
   *   body = { n | n 从 body 入口沿非 loop-back 边可达 } ∩ { n | 去掉本循环的
   *          loop-body 边后，n 从 start 不可达 }
   * 即 body 只包含"必须经由 loop-body 边才能进入"的节点（入口被 loop-body 边支配）。
   * 这使得"循环体外节点"（如 loop-done 的目标）即使被 body 内出边指向也不属于 body，
   * 逃逸检测因此是良定义的。
   */
  const startNodeId = startNodes[0]?.id
  if (startNodeId) {
    for (const loopNode of graph.nodes.filter(n => n.type === 'loop')) {
      const bodyEntryEdges = outgoingOf(loopNode.id, 'loop-body')
      if (bodyEntryEdges.length !== 1) continue // 数量约束已在步骤 4 报错
      const bodyEntryEdge = bodyEntryEdges[0]
      const bodyEntry = bodyEntryEdge.targetNodeId

      // 去掉本循环 loop-body 边后从 start 的可达集（可绕过循环体进入的节点）
      const bypassReachable = computeReachableSet(
        startNodeId,
        edges.filter(e => e !== bodyEntryEdge),
        () => true,
        nodeById
      )
      // 从 body 入口沿非 loop-back 边可达的候选集（含入口自身）
      const fromEntry = computeReachableSet(
        bodyEntry,
        edges,
        e => e.kind !== 'loop-back',
        nodeById
      )
      const bodySet = new Set<string>([bodyEntry, ...fromEntry])
      for (const id of [...bodySet]) {
        if (id === startNodeId || bypassReachable.has(id)) bodySet.delete(id)
      }

      // 入口必须被 loop-body 边支配（存在绕过路径 = 循环体边界含糊）
      if (!bodySet.has(bodyEntry)) {
        addError(
          `循环体入口 ${bodyEntry} 存在绕过循环节点 ${loopNode.id} 的直接进入路径`
        )
        continue
      }

      for (const bodyNodeId of bodySet) {
        const bodyNode = nodeById.get(bodyNodeId)
        if (!bodyNode) continue

        // 嵌套循环禁止（V1）
        if (bodyNode.type === 'loop') {
          addError(`暂不支持嵌套循环（${bodyNodeId} 在 ${loopNode.id} 的循环体内）`)
        }

        for (const e of outgoingOf(bodyNodeId)) {
          if (e.kind === 'loop-back') {
            // 回边必须指向所属循环节点
            if (e.targetNodeId !== loopNode.id) {
              addError(
                `loop-back 边必须指回所属循环节点：${e.sourceNodeId} → ${e.targetNodeId}（应指向 ${loopNode.id}）`
              )
            }
            continue
          }
          // 非 loop-back 出边禁止逃逸到 body 外
          if (!bodySet.has(e.targetNodeId)) {
            addError(
              `循环体节点 ${bodyNodeId} 的出边逃逸到循环外（→ ${e.targetNodeId}）；循环体内只能通过 loop-back 回到循环节点`
            )
          }
        }
      }
    }
  }
  // 指向非循环节点的 loop-back 边（不在任何 body 内的也一并报错）
  for (const edge of edges.filter(e => e.kind === 'loop-back')) {
    const target = nodeById.get(edge.targetNodeId)
    if (target && target.type !== 'loop') {
      addError(
        `loop-back 边的目标 ${edge.targetNodeId} 不是循环节点（应指回 loop 类型节点）`
      )
    }
  }

  // ---------- 7. 环检测（豁免 loop-back） ----------
  const cycleNode = detectCycle(graph.nodes.map(n => n.id), edges)
  if (cycleNode) {
    addError(`图中存在环（经过节点 ${cycleNode}）；除循环体的 loop-back 外不允许成环`)
  }

  // ---------- 8. 可达性（warning） ----------
  const startId = startNodes[0]?.id
  if (startId) {
    const reachable = computeReachableSet(startId, edges, () => true, nodeById)
    reachable.add(startId)
    for (const node of graph.nodes) {
      if (node.id !== startId && !reachable.has(node.id)) {
        addWarning(`节点 ${node.id} 从 start 不可达`)
      }
    }
  }

  // ---------- 9. 节点 config 深度校验（可选注入） ----------
  if (options?.validateNodeConfig) {
    for (const node of graph.nodes) {
      for (const err of options.validateNodeConfig(node)) {
        addError(`节点 ${node.id} 配置错误：${err}`)
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

/** 边 kind 的本地别名（避免与函数内变量遮蔽） */
type WorkflowEdgeKindOf = WorkflowEdge['kind']

/**
 * 计算从起点出发沿满足条件的边可达的节点集合（不含起点自身）。
 * @param startNodeId 起始节点
 * @param edges 全部边
 * @param edgeFilter 边过滤（返回 false 的边不参与传播）
 * @param nodeById 节点表（终点不存在时跳过该边，容错）
 */
function computeReachableSet(
  startNodeId: string,
  edges: WorkflowEdge[],
  edgeFilter: (e: WorkflowEdge) => boolean,
  nodeById: Map<string, WorkflowNode>
): Set<string> {
  const visited = new Set<string>()
  const queue: string[] = []
  // 用边表建邻接表（图规模小，直接过滤也可，这里一次遍历建表）
  const adjacency = new Map<string, WorkflowEdge[]>()
  for (const e of edges) {
    if (!edgeFilter(e)) continue
    const list = adjacency.get(e.sourceNodeId) ?? []
    list.push(e)
    adjacency.set(e.sourceNodeId, list)
  }
  const seedEdges = adjacency.get(startNodeId) ?? []
  for (const e of seedEdges) {
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

/**
 * 三色 DFS 环检测（沿全部边，包括 loop-back）。
 * @returns 成环路径上的任一节点 ID；无环返回 null
 *
 * 实现说明：loop-back 边构成环是合法的，因此检测时把 loop-back 边排除。
 */
function detectCycle(nodeIds: string[], edges: WorkflowEdge[]): string | null {
  // 排除 loop-back：它们是循环体合法的回边
  const nonLoopBackEdges = edges.filter(e => e.kind !== 'loop-back')
  const adjacency = new Map<string, string[]>()
  for (const e of nonLoopBackEdges) {
    const list = adjacency.get(e.sourceNodeId) ?? []
    list.push(e.targetNodeId)
    adjacency.set(e.sourceNodeId, list)
  }

  /** 0=未访问 1=在当前 DFS 栈中 2=已完成 */
  const color = new Map<string, 0 | 1 | 2>()
  for (const id of nodeIds) color.set(id, 0)

  const dfs = (nodeId: string): string | null => {
    color.set(nodeId, 1)
    for (const next of adjacency.get(nodeId) ?? []) {
      const c = color.get(next) ?? 0
      if (c === 1) return next // 回到栈中节点 = 成环
      if (c === 0) {
        const found = dfs(next)
        if (found) return found
      }
    }
    color.set(nodeId, 2)
    return null
  }

  for (const id of nodeIds) {
    if (color.get(id) === 0) {
      const found = dfs(id)
      if (found) return found
    }
  }
  return null
}
