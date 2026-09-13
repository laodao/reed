# -*- coding: utf-8 -*-
"""批次 1b 后半：引擎 sleep/stats/matchRouteEdge（按实际锚点）+ 服务层行为修复"""

p = 'src/core/modules/workflow/engine/workflow-engine.service.ts'
s = open(p, encoding='utf-8').read()

# sleep 替换（无注释行版本）
old = """  private sleep(ms: number, exec: RunExecution): Promise<void> {
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
  }
}"""
new = """  /** 可中断 sleep（取消后立即醒；resolve 语义——醒后由调用方自查 aborted） */
  private sleep(ms: number, exec: RunExecution): Promise<void> {
    return sleepAbortable(ms, exec.abortController.signal, 'resolve')
  }
}"""
assert old in s, 'sleep'
s = s.replace(old, new, 1)

# errorMessage 工具引用 + 删除本地
if "import { errorMessage, sleepAbortable } from './async-utils'" not in s:
    s = s.replace("import { buildNodeMap, computeLoopBody, type LoopBodyInfo } from './graph-topology'",
                  "import { buildNodeMap, computeLoopBody, type LoopBodyInfo } from './graph-topology'\nimport { errorMessage, sleepAbortable } from './async-utils'", 1)
old = """
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
"""
if old in s:
    s = s.replace(old, "", 1)
    print('  local errorMessage removed')

# stats 口径
old = """      totalNodes: this.input.graph.nodes.length,
      doneNodes: done,"""
assert old in s, 'stats'
s = s.replace(old, """      // 口径：totalNodes/doneNodes 均按"执行实例"计（循环体每迭代各 1），二者可比
      totalNodes: this.totalInstanceCount(),
      doneNodes: done,""", 1)
# 实例计数 helper（放 stats 方法后）
old = "  anyUnrecoveredFailure(): boolean {"
assert old in s
s = s.replace(old, """  /** 执行实例总数（根 + 各迭代作用域的 states 之和） */
  totalInstanceCount(): number {
    let n = this.rootScope.states.size
    for (const scope of this.loopScopes.values()) n += scope.states.size
    return n
  }

  anyUnrecoveredFailure(): boolean {""", 1)

# matchRouteEdge 抽取
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
assert old in s, 'activate'
s = s.replace(old, new, 1)

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

old = "/** 运行统计（落库 stats 列的形状） */"
assert old in s, 'stats doc'
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
open(p, 'w', encoding='utf-8').write(s)
print('engine done')

# ── E. definition service：单 cron 校验 + 导入增强 ──
p = 'src/core/modules/workflow/workflow-definition.service.ts'
s = open(p, encoding='utf-8').read()
old = """  /** 图校验（编辑器实时调用；含 handler config 深度校验） */"""
new = """  /**
   * 触发器校验（发布/更新触发器时调用）：
   * - V1 限制：每个定义至多 1 个启用的 cron 触发器（定义级单列 next_fire_at
   *   无法独立调度多个表达式；per-trigger 状态表为 V2 项）
   * - cron 表达式合法性
   */
  validateTriggers(triggers: unknown[]): string[] {
    const errors: string[] = []
    const list = triggers as Array<{ type?: string; expression?: string; enabled?: boolean; eventName?: string }>
    const enabledCron = list.filter(t => t.type === 'cron' && t.enabled)
    if (enabledCron.length > 1) {
      errors.push('V1 限制：每个工作流只能启用 1 个定时触发器')
    }
    for (const t of enabledCron) {
      const preview = previewCronExpression(t.expression ?? '')
      if (!preview.valid) errors.push(`cron 表达式无效：${t.expression}（${preview.error}）`)
    }
    for (const t of list.filter(x => x.type === 'event' && x.enabled)) {
      if (!t.eventName) errors.push('事件触发器缺少 eventName')
    }
    return errors
  }

  /** 图校验（编辑器实时调用；含 handler config 深度校验） */"""
assert old in s, 'validateTriggers'
s = s.replace(old, new, 1)
# import previewCronExpression
old = "import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'"
assert old in s
s = s.replace(old, "import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'\nimport { previewCronExpression } from './trigger/workflow-trigger-scheduler.service'", 1)

# publish 校验触发器
old = """    const result = this.validate(graph)
    if (!result.valid) {
      return { success: false, error: `图校验未通过：${result.errors.slice(0, 5).join('；')}` }
    }"""
assert old in s, 'publish validate'
s = s.replace(old, """    const result = this.validate(graph)
    if (!result.valid) {
      return { success: false, error: `图校验未通过：${result.errors.slice(0, 5).join('；')}` }
    }
    // 触发器合法性（发布时固化——含 V1 单 cron 限制）
    const effectiveTriggers = triggers ?? def.triggers
    const triggerErrors = this.validateTriggers(effectiveTriggers)
    if (triggerErrors.length > 0) {
      return { success: false, error: `触发器配置无效：${triggerErrors.join('；')}` }
    }""", 1)

# 导入：duplicatePolicy + 结构校验
old = """  async importDefinition(
    content: string
  ): Promise<{ success: boolean; error?: string; definition?: WorkflowDefinitionRecord }> {"""
assert old in s, 'import sig'
s = s.replace(old, """  async importDefinition(
    content: string,
    opts?: { duplicatePolicy?: 'copy' | 'overwrite' }
  ): Promise<{ success: boolean; error?: string; definition?: WorkflowDefinitionRecord }> {""", 1)
old = """    const created = await this.create({
      name: `${parsed.name}（导入）`,
      description: parsed.description,
      category: parsed.category,
      draftGraph: graph,
      triggers: Array.isArray(parsed.triggers) ? (parsed.triggers as never) : undefined,
      settings: (parsed.settings as never) ?? undefined,
    })
    return { success: true, definition: created }"""
new = """    // 结构校验（导入即给反馈——草稿也应是合法图；警告不阻断）
    const structure = this.validate(graph)
    if (!structure.valid) {
      return {
        success: false,
        error: `图结构校验未通过：${structure.errors.slice(0, 5).join('；')}`,
      }
    }
    // 覆盖策略：overwrite = 更新同名工作流的草稿（保留其 id/版本/运行历史）
    if (opts?.duplicatePolicy === 'overwrite') {
      const existing = await this.repo.list({ keyword: parsed.name, page: 1, pageSize: 50 })
      const match = existing.items.find(d => d.name === parsed.name)
      if (match) {
        const updated = await this.repo.update(match.id, {
          name: parsed.name,
          description: parsed.description,
          category: parsed.category,
          draftGraph: graph,
          triggers: Array.isArray(parsed.triggers) ? (parsed.triggers as never) : undefined,
          settings: (parsed.settings as never) ?? undefined,
        })
        return { success: true, definition: updated ?? undefined }
      }
      // 无同名 → 落到新建
    }
    const created = await this.create({
      name: opts?.duplicatePolicy === 'overwrite' ? parsed.name : `${parsed.name}（导入）`,
      description: parsed.description,
      category: parsed.category,
      draftGraph: graph,
      triggers: Array.isArray(parsed.triggers) ? (parsed.triggers as never) : undefined,
      settings: (parsed.settings as never) ?? undefined,
    })
    return { success: true, definition: created }"""
assert old in s, 'import body'
s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(s)
print('E. definition service done')

# ── F. repo LIKE 大小写 + order as any + safeParse 行标识 + userId 注释 ──
p = 'src/core/database/repositories/workflow-definition.repository.ts'
s = open(p, encoding='utf-8').read()
old = "      qb.andWhere('(d.name LIKE :kw OR d.description LIKE :kw)', {\n        kw: `%${params.keyword}%`,\n      })"
assert old in s, 'like'
s = s.replace(old, "      // LOWER 双方言统一大小写不敏感（SQLite LIKE 本就不敏感，PG LIKE 敏感）\n      qb.andWhere('(LOWER(d.name) LIKE LOWER(:kw) OR LOWER(d.description) LIKE LOWER(:kw))', {\n        kw: `%${params.keyword}%`,\n      })", 1)
old = "function safeParse<T>(raw: string | null, fallback: T): T {"
assert old in s
s = s.replace(old, "/** JSON 列安全解析（含 id 定位信息，损坏可排查） */\nfunction safeParse<T>(raw: string | null, fallback: T, context = ''): T {", 1)
s = s.replace("    console.warn('[WorkflowDefinitionRepository] JSON 列解析失败，降级处理')",
              "    console.warn(`[WorkflowDefinitionRepository] JSON 列解析失败（${context}），降级处理`)")
open(p, 'w', encoding='utf-8').write(s)
print('F1. definition repo done')

for p, tag in [('src/core/database/repositories/workflow-run.repository.ts', 'WorkflowRunRepository'),
               ('src/core/database/repositories/workflow-node-run.repository.ts', 'WorkflowNodeRunRepository')]:
    s = open(p, encoding='utf-8').read()
    old = "    console.warn('[%s] JSON 列解析失败，降级处理')" % tag if False else None
    s = s.replace("    console.warn('[" + tag + "] JSON 列解析失败，降级处理')",
                  "    console.warn(`[" + tag + "] JSON 列解析失败（${context}），降级处理`)")
    old = "function safeParse<T>(raw: string | null, fallback: T): T {"
    if old in s:
        s = s.replace(old, "/** JSON 列安全解析（含 id 定位信息，损坏可排查） */\nfunction safeParse<T>(raw: string | null, fallback: T, context = ''): T {", 1)
    # order as any 修正：find 的 order 改用类型化写法
    s = s.replace("order: { createdAt: 'ASC' } as any,", "order: { createdAt: 'ASC' } as FindOptionsOrder<typeof extends never> ,")
    open(p, 'w', encoding='utf-8').write(s)
print('F2. repos done（order 断言待 tsc 校正）')
