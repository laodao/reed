/**
 * 工作流图校验器
 * @module core/platform/workflow/engine/graph-validator
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
import { computeLoopBody, computeReachableSet, computeUpstreamSet } from './graph-topology'
import { TEMPLATE_RE } from './variable-resolver'
import { WORKFLOW_RESERVED_NODE_ID, WORKFLOW_NODE_TYPES } from '@shared/types/workflow.types'

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

  /** review-choose 模式判定（P1：branch 来源对 choose 交互的审核节点放行） */
  function isChooseReview(node: WorkflowNode): boolean {
    return (
      node.type === WORKFLOW_NODE_TYPES['human-review'] &&
      (node.config as { interaction?: string }).interaction === 'choose'
    )
  }

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
    // 保留字：sys=系统变量根；start 仅开始节点可用（变量命名空间冲突防护）
    if (node.id === WORKFLOW_RESERVED_NODE_ID || (node.id === WORKFLOW_NODE_TYPES.start && node.type !== WORKFLOW_NODE_TYPES.start)) {
      addError(`节点 id 不能使用保留字：${node.id}`)
    }
    if (!NODE_TYPE_CATALOG_MAP[node.type as keyof typeof NODE_TYPE_CATALOG_MAP]) {
      addError(`未知节点类型：${node.type}（节点 ${node.id}）`)
    }
  }

  // ---------- 1.5 choose 审核 × 超时批准组合禁止 ----------
  // choose 决策必须携带用户所选选项；超时批准路径无默认选项，applyReviewDecision
  // 对非 reject 决策强制校验 choice ∈ options → 必抛 → 运行永久挂起。
  // 配置错误应在发布前拦截（引擎超时路径已加 try/catch 转 fail 兜底，见 tickReviewTimeouts）。
  for (const node of graph.nodes) {
    if (isChooseReview(node)) {
      const cfg = node.config as { timeoutPolicy?: string }
      if (cfg.timeoutPolicy === 'approve') {
        addError(`节点 ${node.id}：choose 交互不支持「超时批准」（超时批准无默认选项，审核超时后必失败），请改用「超时失败」或为 choose 提供默认选项`)
      }
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
    // choose 模式审核：branch 合法 + approve 不再必填（选项边取代批准边）
    const chooseMode = isChooseReview(node)
    if (chooseMode) allowedKinds.add('branch')
    // kind 合法性
    for (const [kind, list] of byKind) {
      if (!allowedKinds.has(kind)) {
        addError(`节点 ${node.id}（${catalog.label}）不允许 ${kind} 类型出边`)
      }
    }
    // required / max
    for (const port of catalog.ports) {
      const list = byKind.get(port.kind) ?? []
      if (list.length === 0 && port.required && !(chooseMode && port.kind === 'approve')) {
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
    if (source.type !== 'condition' && !isChooseReview(source)) {
      addError(`branch 出边只能来自条件分支或 choose 模式审核节点（${source.id} 是 ${source.type}）`)
      continue
    }
    if (!edge.branchId) {
      addError(`条件分支 ${source.id} 的 branch 出边缺少 branchId`)
      continue
    }
    if (isChooseReview(source)) {
      // choose 审核：branchId 必须在 options 中声明
      const options = (source.config as { options?: Array<{ key: string }> }).options ?? []
      if (!options.some(o => o.key === edge.branchId)) {
        addError(`选项「${edge.branchId}」未在审核节点 ${source.id} 的选项配置中声明`)
      }
    } else {
      const branches = (source.config as { branches?: Array<{ branchId: string }> }).branches ?? []
      if (!branches.some(b => b.branchId === edge.branchId)) {
        addError(`branchId「${edge.branchId}」未在节点 ${source.id} 的分支配置中声明`)
      }
    }
  }
  // 同一 branchId 只允许一条出边（显式并行原则）+ 声明的分支必须有出边（防静默吞分支）
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
    // 反向：config 中声明的每个分支都必须有对应出边，否则运行时命中该分支
    // 会被静默吞掉（下游零到达 → 宽容收敛 succeeded，无任何告警）
    const branches = (node.config as { branches?: Array<{ branchId: string }> }).branches ?? []
    for (const br of branches) {
      if (br.branchId && (seen.get(br.branchId) ?? 0) === 0) {
        addError(`节点 ${node.id} 的分支「${br.branchId}」已声明但没有连接出边`)
      }
    }
    const cfg = node.config as { noMatchPolicy?: string; fallbackBranchId?: string }
    if (cfg.noMatchPolicy === 'fallback' && cfg.fallbackBranchId) {
      if ((seen.get(cfg.fallbackBranchId) ?? 0) === 0) {
        addError(
          `节点 ${node.id} 的 fallback 分支「${cfg.fallbackBranchId}」没有连接出边`
        )
      }
    }
  }
  // choose 模式审核：选项声明与出边配对校验（防静默吞选项——P1 配套）
  for (const node of graph.nodes.filter(isChooseReview)) {
    const optSeen = new Set<string>()
    for (const e of outgoingOf(node.id, 'branch')) optSeen.add(e.branchId ?? '')
    const options = (node.config as { options?: Array<{ key: string }> }).options ?? []
    if (options.length === 0) {
      addError(`choose 模式审核节点 ${node.id} 至少需要一个选项`)
    }
    for (const opt of options) {
      if (!opt.key) addError(`审核节点 ${node.id} 的选项缺少 key`)
      else if (!optSeen.has(opt.key)) {
        addError(`审核节点 ${node.id} 的选项「${opt.key}」已声明但没有连接出边`)
      }
    }
  }

  // ---------- 6. 循环体规则（支配节点定义，拓扑计算见 graph-topology.computeLoopBody） ----------
  const startNodeId = startNodes[0]?.id
  if (startNodeId) {
    for (const loopNode of graph.nodes.filter(n => n.type === 'loop')) {
      const bodyEntryEdges = outgoingOf(loopNode.id, 'loop-body')
      if (bodyEntryEdges.length !== 1) continue // 数量约束已在步骤 4 报错

      const { bodyEntry, bodySet, dominated } = computeLoopBody(
        graph,
        nodeById,
        loopNode.id,
        bodyEntryEdges[0]
      )
      // 入口必须被 loop-body 边支配（存在绕过路径 = 循环体边界含糊）
      if (!dominated) {
        addError(`循环体入口 ${bodyEntry} 存在绕过循环节点 ${loopNode.id} 的直接进入路径`)
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
    // C1：自由环合法（重执行语义），警告提示确保可跳出
    addWarning(
      `图中存在环（经过节点 ${cycleNode}）：请确保环内有条件分支或人工交互节点可跳出，超出最大运行次数将自动停止`
    )
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

  // ---------- 9. 变量引用可达性（被引用节点必须是当前节点拓扑上游） ----------
  validateVariableReferences(graph, nodeById, edges, addError)

  // ---------- 10. 节点 config 深度校验（可选注入） ----------
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

/**
 * 变量引用可达性校验（规则 9）：
 * 扫描各节点 config 中的 {{}} 模板引用，被引用节点必须位于当前节点的拓扑上游
 * （先于当前节点执行）——防止引用后置/未执行环节的输出导致运行时空值或错误结果。
 *
 * 豁免：
 * - {{sys.*}} 系统变量根始终可用
 * - {{start.*}} start 输入命名空间（当前节点须从 start 可达）
 * - 循环体内部节点引用所属 loop 的伪变量（{{loop.item}} 等局部可用）
 */
function validateVariableReferences(
  graph: WorkflowGraph,
  nodeById: Map<string, WorkflowNode>,
  edges: WorkflowEdge[],
  addError: (msg: string) => void
): void {
  // 各节点上游可达集合（排除 loop-back：loop 不依赖 body 输出）
  const upstreamOf = new Map<string, Set<string>>()
  for (const node of graph.nodes) {
    upstreamOf.set(
      node.id,
      computeUpstreamSet(node.id, edges, e => e.kind !== 'loop-back', nodeById)
    )
  }
  // 节点 → 所属循环的 loop 节点集合（body 内可引用该 loop 的 item/index 伪变量）
  const bodyOf = new Map<string, Set<string>>()
  for (const loopNode of graph.nodes.filter(n => n.type === 'loop')) {
    const bodyEntryEdge = edges.find(
      e => e.sourceNodeId === loopNode.id && e.kind === 'loop-body'
    )
    if (!bodyEntryEdge || !nodeById.has(bodyEntryEdge.targetNodeId)) continue
    const { bodySet } = computeLoopBody(graph, nodeById, loopNode.id, bodyEntryEdge)
    for (const id of bodySet) {
      const list = bodyOf.get(id) ?? new Set<string>()
      list.add(loopNode.id)
      bodyOf.set(id, list)
    }
  }
  const startId = graph.nodes.find(n => n.type === 'start')?.id

  for (const node of graph.nodes) {
    const refs = new Set<string>()
    walkTemplateRefs(node.config, refs)
    for (const path of refs) {
      const root = path.split('.')[0]
      if (root === 'item') continue // list-check 表单字段的行内插值（{{item.xx}}），非工作流变量
      if (root === 'sys') continue // 系统变量根始终可用
      if (root === 'start') {
        // start 输入命名空间：start 节点存在且在当前位置可达（或当前即 start）
        if (node.id !== startId && !upstreamOf.get(node.id)?.has(startId ?? '')) {
          addError(
            `节点 ${node.id} 引用了 start 输入（{{${path}}}），但当前节点不在 start 可达链路内`
          )
        }
        continue
      }
      if (!nodeById.has(root)) {
        addError(`节点 ${node.id} 引用了不存在的节点变量：{{${path}}}`)
        continue
      }
      const upstream = upstreamOf.get(node.id) ?? new Set<string>()
      if (upstream.has(root)) continue // 上游节点输出：合法
      // 循环体内部：所属 loop 的伪变量（item/index）局部可用
      if (bodyOf.get(node.id)?.has(root)) continue
      addError(
        `节点 ${node.id} 引用了不在其上游的节点输出：{{${path}}}（${root} 是后置或未执行环节）`
      )
    }
  }
}

/** 深遍历对象，收集全部 {{}} 模板引用路径（去重，顺序无关） */
function walkTemplateRefs(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    TEMPLATE_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TEMPLATE_RE.exec(value)) !== null) out.add(m[1])
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) walkTemplateRefs(item, out)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) walkTemplateRefs(v, out)
  }
}
