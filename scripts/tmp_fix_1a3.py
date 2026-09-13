# -*- coding: utf-8 -*-
"""批次 1a 续 2：引擎（实际注释头为'有界截断'版）+ 步骤 7-12"""

p = 'src/core/modules/workflow/engine/workflow-engine.service.ts'
s = open(p, encoding='utf-8').read()

old = "  const perFieldCap = Math.floor((maxChars - 256) / Math.max(1, keys.length))"
assert old in s, 'cap'
s = s.replace(old, "  const perFieldCap = Math.floor((maxChars - TRUNCATE_OVERHEAD_CHARS) / Math.max(1, keys.length))", 1)
old = "  if (perFieldCap < 64) {"
assert old in s, 'min'
s = s.replace(old, "  if (perFieldCap < TRUNCATE_MIN_FIELD_CHARS) {", 1)
old = "    return { __truncated: true, keyCount: keys.length, keysPreview: keys.slice(0, 50) }"
assert old in s, 'preview'
s = s.replace(old, "    return { __truncated: true, keyCount: keys.length, keysPreview: keys.slice(0, TRUNCATE_KEY_PREVIEW_COUNT) }", 1)
old = "/** 有界截断：保留全部字段键，均分预算；键过多时整体降级为键名预览 */"
assert old in s, 'doc'
s = s.replace(old, """/** 截断算法调优常量（与 maxOutputChars 的关系：预留结构开销 / 单字段下限 / 键名预览数） */
const TRUNCATE_OVERHEAD_CHARS = 256
const TRUNCATE_MIN_FIELD_CHARS = 64
const TRUNCATE_KEY_PREVIEW_COUNT = 50

/** 有界截断：保留全部字段键，均分预算；键过多时整体降级为键名预览 */""", 1)

old = "/** 执行作用域：根作用域或某循环迭代 */"
assert old in s, 'scope doc'
s = s.replace(old, """/** 根作用域键 */
const ROOT_SCOPE_KEY = 'root'
/** 循环迭代作用域键：`${loopNodeId}:${iterationIndex}` */
function makeScopeKey(loopNodeId: string, iterationIndex: number): string {
  return `${loopNodeId}:${iterationIndex}`
}
/** 从作用域键反解循环节点 ID */
function parseScopeLoopNodeId(scopeKey: string): string {
  return scopeKey.split(':')[0]
}

/** 执行作用域：根作用域或某循环迭代 */""", 1)
s = s.replace("readonly rootScope = new ScopeState('root', 0, null)",
              'readonly rootScope = new ScopeState(ROOT_SCOPE_KEY, 0, null)', 1)
old = "    return this.key === 'root'"
assert old in s, 'isRoot'
s = s.replace(old, '    return this.key === ROOT_SCOPE_KEY', 1)
old = "      const scopeKey = `${node.id}:${i}`"
assert old in s, 'scopeKey'
s = s.replace(old, '      const scopeKey = makeScopeKey(node.id, i)', 1)
old = "        const loopNodeId = scopeKey.split(':')[0]"
assert old in s, 'parse'
s = s.replace(old, '        const loopNodeId = parseScopeLoopNodeId(scopeKey)', 1)

old = """  private findWaitingScope(exec: RunExecution): ScopeState | null {
    if (exec.rootScope.states.has) {
      for (const s of exec.rootScope.states.values()) {
        if (s.status === 'waiting_review') return exec.rootScope
      }
    }"""
if old in s:
    s = s.replace(old, """  private findWaitingScope(exec: RunExecution): ScopeState | null {
    for (const s of exec.rootScope.states.values()) {
      if (s.status === 'waiting_review') return exec.rootScope
    }""", 1)
    print('  findWaiting cleaned')

old = "        status: cp.nodeType === 'loop' ? 'succeeded' : 'succeeded',"
if old in s:
    s = s.replace(old, "        status: 'succeeded',", 1)
    print('  dead ternary cleaned')

open(p, 'w', encoding='utf-8').write(s)
print('engine done')

p = 'src/core/modules/workflow/engine/node-handler.ts'
s = open(p, encoding='utf-8').read()
if 'setlle' in s:
    s = s.replace('setlle', 'settle')
    open(p, 'w', encoding='utf-8').write(s)
    print('typo fixed')

p = 'src/core/modules/workflow/nodes/control-nodes.ts'
s = open(p, encoding='utf-8').read()
old = "import { stringifyValue } from '../engine/variable-resolver'"
assert old in s, 'import'
s = s.replace(old, "import { stringifyValue } from '../engine/variable-resolver'\nimport { encodeWorkflowHandleId } from '@shared/types/workflow.types'", 1)
cnt = s.count('route: `branch:${br.branchId}`')
assert cnt == 2, f'route count {cnt}'
s = s.replace('route: `branch:${br.branchId}`',
              "route: encodeWorkflowHandleId('branch', br.branchId)")
open(p, 'w', encoding='utf-8').write(s)
print('condition done')

p = 'src/core/database/repositories/workflow-node-run.repository.ts'
s = open(p, encoding='utf-8').read()
old = "  decision: 'approve' | 'approve_with_changes' | 'reject'"
assert old in s
s = s.replace(old, "  decision: 'approve' | 'approve_with_changes' | 'reject' | 'timeout_approve' | 'timeout_reject'", 1)
open(p, 'w', encoding='utf-8').write(s)
print('review type done')

p = 'src/core/modules/workflow/workflow-boot.ts'
s = open(p, encoding='utf-8').read()
old = "  }, WORKFLOW_DEFAULTS.cronTickMs)"
assert old in s
s = s.replace(old, "  }, WORKFLOW_DEFAULTS.reviewTimeoutTickMs)", 1)
s = s.replace("// 5. 审核超时 ticker（30s 扫描挂起审核的 wait_expires_at）",
              "// 5. 审核超时 ticker（间隔独立于 cronTick 可单独调优）", 1)
open(p, 'w', encoding='utf-8').write(s)
print('boot ticker done')

for path, tag in [('src/electron/index.ts', 'boot'), ('src/web/server/index.ts', 'web-server')]:
    s = open(path, encoding='utf-8').read()
    old = f"console.warn('[{tag}] 工作流子系统启动失败（不致命）:', e?.message ?? e)"
    if old in s:
        s = s.replace(old, f"console.warn('[{tag}] 工作流子系统启动失败（不致命）', e)", 1)
        open(path, 'w', encoding='utf-8').write(s)
        print(f'{tag} catch fixed')

p = 'src/core/modules/workflow/trigger/domain-event-bus.ts'
s = open(p, encoding='utf-8').read()
old = "    this.emitter.setMaxListeners(50)"
assert old in s
s = s.replace(old, """    // 监听上限：当前订阅方仅调度器 1 个；预留给多模块订阅（超限 Node 告警而非静默漏收）
    this.emitter.setMaxListeners(EVENT_BUS_MAX_LISTENERS)""", 1)
old = "class WorkflowDomainEventBus {"
assert old in s
s = s.replace(old, "/** 事件总线监听上限（量级假设见构造内注释） */\nconst EVENT_BUS_MAX_LISTENERS = 50\n\nclass WorkflowDomainEventBus {", 1)
open(p, 'w', encoding='utf-8').write(s)
print('bus done')
