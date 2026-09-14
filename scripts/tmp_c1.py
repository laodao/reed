# -*- coding: utf-8 -*-
"""C1 成环实现：边激活序号 + computeReady 重执行 + 校验器环降警告"""

# ── 1. 校验器：环检测降为警告 ──
p = 'src/core/modules/workflow/engine/graph-validator.ts'
s = open(p, encoding='utf-8').read()
old = """  const cycleNode = detectCycle(graph.nodes.map(n => n.id), edges)
  if (cycleNode) {
    addError(`图中存在环（经过节点 ${cycleNode}）；除循环体的 loop-back 外不允许成环`)
  }"""
assert old in s, 'cycle'
s = s.replace(old, """  const cycleNode = detectCycle(graph.nodes.map(n => n.id), edges)
  if (cycleNode) {
    // C1：自由环合法（重执行语义），但需要用户确保环内可跳出——警告提示
    addWarning(
      `图中存在环（经过节点 ${cycleNode}）：请确保环内有条件分支或人工交互节点可跳出，超出最大运行次数将自动停止`
    )
  }""", 1)
open(p, 'w', encoding='utf-8').write(s)
print('1. validator cycle→warning')

# ── 2. 引擎：activationSeqs + 重执行 ──
p = 'src/core/modules/workflow/engine/workflow-engine.service.ts'
s = open(p, encoding='utf-8').read()

# 2a. ScopeState 字段
old = "  readonly activatedEdges = new Set<string>()"
assert old in s, 'field'
s = s.replace(old, """  /** 边激活序号（C1 环支持：完成后的新激活触发重执行） */
  readonly activationSeqs = new Map<string, number>()
  /** 激活计数器（单调递增） */
  activationCounter = 0""", 1)

# 2b. activatedEdges 引用点全部替换为 activationSeqs 判定
s = s.replace("scope.activatedEdges.has(edge.id)", "(scope.activationSeqs.get(edge.id) ?? 0) > 0")
s = s.replace("exec.rootScope.activatedEdges.add(edge.id)", "void exec.rootScope.activationSeqs.set(edge.id, ++exec.rootScope.activationCounter)")
s = s.replace("loopScope.activatedEdges.add(edge.id)", "void loopScope.activationSeqs.set(edge.id, ++loopScope.activationCounter)")

# 2c. 节点终态记 completedSeq
old = """    state.status = 'succeeded'
    state.output = output
    state.routeTaken = result.route ?? null
    this.setScopeVariable(exec, scope, state.nodeId, output)"""
assert old in s, 'success seq'
s = s.replace(old, """    state.status = 'succeeded'
    state.output = output
    state.routeTaken = result.route ?? null
    state.completedSeq = ++scope.activationCounter // C1：记录完成序号（后续新激活触发重执行）
    this.setScopeVariable(exec, scope, state.nodeId, output)""", 1)

# NodeExecutionState 加 completedSeq 字段
old = "  waitExpiresAt?: Date | null\n  startedAtMs: number"
assert old in s, 'state field'
s = s.replace(old, "  waitExpiresAt?: Date | null\n  /** 节点进入终态时的激活序号（C1 环：seq 更大的入边激活触发重执行） */\n  completedSeq?: number\n  startedAtMs: number", 1)

# 2d. computeReady 重执行判定
old = """      const state = scope.states.get(node.id)
      if (state && state.status !== 'pending') continue // 已启动过
      if (sem.rootOnly) {"""
if old not in s:
    # 实际文本探查
    import re
    m = re.search(r"const state = scope\.states\.get\(node\.id\)\n\s*if \(state[^\n]*\n", s)
    print('computeReady pattern:', m.group(0) if m else 'NOT FOUND')
    raise SystemExit(1)
s = s.replace(old, """      const state = scope.states.get(node.id)
      if (state && state.status !== WORKFLOW_NODE_RUN_STATUSES.pending) {
        // C1 环重执行判定：终态节点 + 完成后有新激活的入边 → 允许重执行
        const isTerminal = ['succeeded', 'failed', 'failed_recovered', 'cancelled', 'timed_out'].includes(state.status)
        if (!isTerminal) continue // running/waiting 中
        const hasNewActivation = exec
          .incomingOf(node.id)
          .some(e => (scope.activationSeqs.get(e.id) ?? 0) > (state.completedSeq ?? 0))
        if (hasNewActivation) {
          // 重执行：清 state（variables 保留旧输出直至覆盖——Bisheng 多轮语义）
          scope.states.delete(node.id)
          scope.mergeArrivals.delete(node.id)
        } else {
          continue
        }
      }
      if (sem.rootOnly) {""", 1)
open(p, 'w', encoding='utf-8').write(s)
print('2. engine cycles done')
