# -*- coding: utf-8 -*-
"""批次 1b：行为修复（12 项）"""

# ── A. async-utils：模块内 sleep/pollUntil/errorMessage 收敛 ──
UTILS = '''/**
 * 工作流模块异步工具（模块内唯一实现）
 * @module core/modules/workflow/engine/async-utils
 * @description signal 感知的 sleep 与轮询、错误信息提取——引擎与节点共用。
 */

/** 可中断 sleep：onAbort='resolve' 供引擎重试路径（醒后自查 aborted），'reject' 供节点中断 */
export function sleepAbortable(
  ms: number,
  signal: AbortSignal,
  onAbort: 'resolve' | 'reject' = 'resolve'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(finish, ms)
    function finish() {
      clearTimeout(t)
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    function onAbort() {
      clearTimeout(t)
      if (onAbort === 'reject') reject(new Error('已取消'))
      else resolve()
    }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** 信号感知轮询：间隔期取消即时响应（内部用 sleepAbortable，不等满一个 interval） */
export async function pollUntil<T>(
  check: () => Promise<T | undefined>,
  opts: { intervalMs: number; timeoutMs: number; signal: AbortSignal }
): Promise<T> {
  const deadline = Date.now() + opts.timeoutMs
  while (Date.now() < deadline) {
    if (opts.signal.aborted) throw new Error('已取消')
    const result = await check()
    if (result !== undefined) return result
    await sleepAbortable(opts.intervalMs, opts.signal, 'reject').catch(() => {
      throw new Error('已取消')
    })
  }
  throw new Error('等待超时')
}

/** 错误信息提取（模块内唯一实现） */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
'''
open('src/core/modules/workflow/engine/async-utils.ts', 'w', encoding='utf-8').write(UTILS)
print('A. async-utils created')

# ── B. ai-nodes/task-nodes 引用公共工具，删除本地实现 ──
p = 'src/core/modules/workflow/nodes/task-nodes.ts'
s = open(p, encoding='utf-8').read()
old = """/** signal 感知的 sleep */
function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(finish, ms)
    function finish() {
      clearTimeout(t)
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    function onAbort() {
      clearTimeout(t)
      reject(new Error('已取消'))
    }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
}

"""
assert old in s, 'task sleep'
s = s.replace(old, '', 1)
old = "import { WORKFLOW_DEFAULTS, WORKFLOW_LIMITS } from '@shared/types/workflow.types'"
s = s.replace(old, old + "\nimport { sleepAbortable } from '../engine/async-utils'", 1)
s = s.replace("await sleepAbortable(ms, ctx.signal)", "await sleepAbortable(ms, ctx.signal, 'reject')")
open(p, 'w', encoding='utf-8').write(s)
print('B1. task-nodes done')

p = 'src/core/modules/workflow/nodes/ai-nodes.ts'
s = open(p, encoding='utf-8').read()
old = """/** 信号已取消则抛错（可取消节点的检查点） */
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('已取消')
}

/** 信号感知轮询等待：每 intervalMs 检查一次直到 predicate 返回非 undefined 或超时 */
async function pollUntil<T>(
  check: () => Promise<T | undefined>,
  opts: { intervalMs: number; timeoutMs: number; signal: AbortSignal }
): Promise<T> {
  const deadline = Date.now() + opts.timeoutMs
  while (Date.now() < deadline) {
    throwIfAborted(opts.signal)
    const result = await check()
    if (result !== undefined) return result
    await new Promise(r => setTimeout(r, opts.intervalMs))
  }
  throw new Error('等待超时')
}

"""
assert old in s, 'ai pollUntil'
s = s.replace(old, "", 1)
old = "import { WORKFLOW_DEFAULTS, WORKFLOW_RUN_EVENT_CHANNEL } from '@shared/types/workflow.types'"
s = s.replace(old, old + "\nimport { pollUntil } from '../engine/async-utils'", 1)
# kb-retrieve 检查点保留（throwIfAborted 内联）
s = s.replace("    throwIfAborted(ctx.signal)", "    if (ctx.signal.aborted) throw new Error('已取消')")

# ── C. lw-polish waitForCompletion 双模式 ──
old = """    const eventId = makeLwEventId(ctx)
    const run = () =>
      LongWritingAIService.getInstance().polishBackground(
        eventId,
        cfg.projectId,
        cfg.field as never,
        cfg.eraType ?? '',
        stringifyValue(cfg.content),
        cfg.providerConfigId,
        cfg.modelId
      )
    const resp = await run()
    if (!resp.success) {
      return { status: 'failed', error: `润色失败: ${resp.error ?? '未知错误'}` }
    }
    const data = resp.data as { content?: string; polished?: string; text?: string } | undefined
    return {
      status: 'succeeded',
      output: { content: data?.content ?? data?.polished ?? data?.text ?? '' },
    }"""
new = """    const eventId = makeLwEventId(ctx)
    const run = () =>
      LongWritingAIService.getInstance().polishBackground(
        eventId,
        cfg.projectId,
        cfg.field as never,
        cfg.eraType ?? '',
        stringifyValue(cfg.content),
        cfg.providerConfigId,
        cfg.modelId
      )
    if (cfg.waitForCompletion === false) {
      // 提交即成功：后台跑润色（失败只记日志），与 lw-generate-chapter 同模式
      void run().catch(e => ctx.logger.error('润色（后台）失败', e))
      return { status: 'succeeded', output: { eventId, status: 'submitted' } }
    }
    const resp = await run()
    if (!resp.success) {
      return { status: 'failed', error: `润色失败: ${resp.error ?? '未知错误'}` }
    }
    const data = resp.data as { content?: string; polished?: string; text?: string } | undefined
    return {
      status: 'succeeded',
      output: { content: data?.content ?? data?.polished ?? data?.text ?? '' },
    }"""
assert old in s, 'lw-polish'
s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(s)
print('C. lw-polish done')

# ── D. 引擎：sleep/errorMessage 引用公共工具 + matchRouteEdge 抽取 + stats 口径 ──
p = 'src/core/modules/workflow/engine/workflow-engine.service.ts'
s = open(p, encoding='utf-8').read()
# 引用公共 errorMessage/sleep
s = s.replace("import { buildNodeMap, computeLoopBody, type LoopBodyInfo } from './graph-topology'",
              "import { buildNodeMap, computeLoopBody, type LoopBodyInfo } from './graph-topology'\nimport { errorMessage, sleepAbortable } from './async-utils'", 1)
# 删除文件尾 errorMessage
old = """
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
"""
assert old in s, 'engine errorMessage'
s = s.replace(old, "", 1)
# sleep 方法改用工具
old = """  /** 可中断 sleep（取消后立即醒） */
  private sleep(ms: number, exec: RunExecution): Promise<void> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        exec.abortController.signal.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      const onAbort = () => {
        clearTimeout(timer)
        resolve()
      }
      if (exec.abortController.signal.aborted) onAbort()
      else exec.abortController.signal.addEventListener('abort', onAbort, { once: true })
    })
  }"""
assert old in s, 'engine sleep'
s = s.replace(old, """  /** 可中断 sleep（取消后立即醒；resolve 语义——醒后由调用方自查 aborted） */
  private sleep(ms: number, exec: RunExecution): Promise<void> {
    return sleepAbortable(ms, exec.abortController.signal, 'resolve')
  }""", 1)

# matchRouteEdge 抽取（activateOutgoing 与 hydrateCheckpoints 复用）
old = """  /** 成功后的出边激活：route 优先（条件/审核），否则全部 normal 出边 */
  private activateOutgoing(exec: RunExecution, scope: ScopeState, node: WorkflowNode, route?: string): void {
    for (const edge of exec.outgoingOf(node.id)) {
      if (edge.kind === 'loop-back' || edge.kind === 'fail') continue
      if (edge.kind === 'loop-body' || edge.kind === 'loop-done') continue // 循环专有，由驱动器激活
      if (route) {
        const matches =
          edge.kind === 'branch'
            ? route === encodeWorkflowHandleId('branch', edge.branchId)
            : route === encodeWorkflowHandleId(edge.kind)
        if (matches) this.activateEdge(exec, scope, edge)
      } else if (edge.kind === 'normal') {
        this.activateEdge(exec, scope, edge)
      }
    }
  }"""
new = """  /** 成功后的出边激活：route 优先（条件/审核），否则全部 normal 出边 */
  private activateOutgoing(exec: RunExecution, scope: ScopeState, node: WorkflowNode, route?: string): void {
    for (const edge of exec.outgoingOf(node.id)) {
      if (edge.kind === 'loop-back' || edge.kind === 'fail') continue
      if (edge.kind === 'loop-body' || edge.kind === 'loop-done') continue // 循环专有，由驱动器激活
      if (matchRouteEdge(edge, route)) this.activateEdge(exec, scope, edge)
    }
  }"""
assert old in s, 'activateOutgoing'
s = s.replace(old, new, 1)

# hydrateCheckpoints 的重复匹配逻辑改用 matchRouteEdge
old = """      const route = cp.routeTaken ?? undefined
      for (const edge of exec.outgoingOf(cp.nodeId)) {
        if (edge.kind === 'loop-back' || edge.kind === 'loop-body' || edge.kind === 'loop-done') continue
        if (edge.kind === 'fail') continue // failed_recovered 的 fail 边：checkpoint 只含 succeeded
        if (route) {
          const matches =
            edge.kind === 'branch'
              ? route === encodeWorkflowHandleId('branch', edge.branchId)
              : route === encodeWorkflowHandleId(edge.kind)
          if (matches) exec.rootScope.activatedEdges.add(edge.id)
        } else if (edge.kind === 'normal') {
          exec.rootScope.activatedEdges.add(edge.id)
        }
      }"""
new = """      const route = cp.routeTaken ?? undefined
      for (const edge of exec.outgoingOf(cp.nodeId)) {
        if (edge.kind === 'fail' || edge.kind === 'loop-back' || edge.kind === 'loop-body' || edge.kind === 'loop-done') continue
        if (matchRouteEdge(edge, route)) exec.rootScope.activatedEdges.add(edge.id)
      }"""
assert old in s, 'hydrate'
s = s.replace(old, new, 1)

# matchRouteEdge 纯函数（放 encodeWorkflowHandleId import 之后）
old = "/** 运行统计（落库 stats 列的形状） */"
assert old in s
s = s.replace(old, """/** route → 边匹配的唯一实现（activateOutgoing 与 hydrateCheckpoints 共用）：
 *  有 route 时按编码精确匹配（branch 按 branchId，其余按 kind）；无 route 匹配 normal 边 */
function matchRouteEdge(edge: WorkflowEdge, route?: string): boolean {
  if (route) {
    return edge.kind === 'branch'
      ? route === encodeWorkflowHandleId('branch', edge.branchId)
      : route === encodeWorkflowHandleId(edge.kind)
  }
  return edge.kind === 'normal'
}

/** 运行统计（落库 stats 列的形状） */""", 1)

# stats 口径：totalNodes 改执行实例口径（与 doneNodes 同口径，可比）
old = """    count(this.rootScope)
    for (const scope of this.loopScopes.values()) count(scope)
    return {
      totalNodes: this.input.graph.nodes.length,
      doneNodes: done,
      failedNodes: failed,
      recoveredNodes: recovered,
    }"""
new = """    let instances = 0
    const countInstances = (scope: ScopeState) => {
      instances += scope.states.size
    }
    count(this.rootScope)
    for (const scope of this.loopScopes.values()) count(scope)
    countInstances(this.rootScope)
    for (const scope of this.loopScopes.values()) countInstances(scope)
    // 口径说明：totalNodes/doneNodes 均按"执行实例"计（循环体每迭代各 1），
    // 二者可比；未执行的节点（不可达/被跳过）不占 totalNodes
    return {
      totalNodes: instances,
      doneNodes: done,
      failedNodes: failed,
      recoveredNodes: recovered,
    }"""
assert old in s, 'stats'
s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(s)
print('D. engine done')
