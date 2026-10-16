# -*- coding: utf-8 -*-
"""批次 1a：字面量常量化 + KB signal 透传 + 节点常量引用 + 引擎常量/死代码清理"""

# ── 1. shared 类型：DEFAULTS/LIMITS 新键 + SearchRequest.signal ──
p = 'src/shared/types/workflow.types.ts'
s = open(p, encoding='utf-8').read()
old = """  /** cron 调度间隔 30s */
  cronTickMs: 30_000,
  /** cron 错过宽限窗口 = 2 × tick（超过视为错过，推进到未来首个触发点） */
  cronGraceFactor: 2,
} as const"""
new = """  /** cron 调度间隔 30s */
  cronTickMs: 30_000,
  /** cron 错过宽限窗口 = 2 × tick（超过视为错过，推进到未来首个触发点） */
  cronGraceFactor: 2,
  /** 审核超时扫描间隔（独立于 cronTick——语义无关，可独立调优） */
  reviewTimeoutTickMs: 30_000,
  /** HTTP 请求节点默认超时（封顶 WORKFLOW_LIMITS.httpTimeoutMs） */
  httpRequestTimeoutMs: 30_000,
  /** 知识库入库等待：轮询间隔 / 总超时 */
  kbIngestPollIntervalMs: 500,
  kbIngestWaitTimeoutMs: 120_000,
  /** 图像生成等待：轮询间隔 / 总超时 */
  imagePollIntervalMs: 2_000,
  imagePollTimeoutMs: 300_000,
} as const"""
assert old in s, 'defaults'
s = s.replace(old, new, 1)
old = """  retryDelayMs: 60_000,
  httpTimeoutMs: 300_000,
} as const"""
new = """  retryDelayMs: 60_000,
  httpTimeoutMs: 300_000,
  imagePollTimeoutMs: 600_000,
} as const"""
assert old in s, 'limits'
s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(s)
print('1. types defaults done')

p = 'src/shared/types/knowledge-base.types.ts'
s = open(p, encoding='utf-8').read()
old = """export interface SearchRequest {
  /** 知识库 ID */
  knowledgeBaseId: string
  /** 查询文本 */
  query: string"""
new = """export interface SearchRequest {
  /** 知识库 ID */
  knowledgeBaseId: string
  /** 查询文本 */
  query: string
  /** 取消信号（透传到嵌入 HTTP 调用，向后兼容可选） */
  signal?: AbortSignal"""
assert old in s, 'searchreq'
s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(s)
print('2. searchreq signal done')

# ── 3. KB：getEmbeddingVectors/search 透传 signal ──
p = 'src/core/services/knowledge-base.service.ts'
s = open(p, encoding='utf-8').read()
old = "  async getEmbeddingVectors(texts: string[], config: EmbeddingConfig): Promise<number[][] | null> {"
assert old in s
s = s.replace(old, "  async getEmbeddingVectors(texts: string[], config: EmbeddingConfig, signal?: AbortSignal): Promise<number[][] | null> {", 1)
old = """      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, input: texts })
      })"""
assert old in s
s = s.replace(old, """      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, input: texts }),
        ...(signal ? { signal } : {})
      })""", 1)
old = "      const vectors = await this.getEmbeddingVectors([req.query], config)"
assert old in s
s = s.replace(old, "      const vectors = await this.getEmbeddingVectors([req.query], config, req.signal)", 1)
open(p, 'w', encoding='utf-8').write(s)
print('3. kb signal done')

# ── 4. kb-retrieve 节点透传 signal；轮询常量引用 ──
p = 'src/core/modules/workflow/nodes/ai-nodes.ts'
s = open(p, encoding='utf-8').read()
old = """    const resp = await service.search({
      knowledgeBaseId: cfg.knowledgeBaseId,
      query: stringifyValue(cfg.query),
      topK: cfg.topK,
      threshold: cfg.threshold,
    })"""
assert old in s
s = s.replace(old, """    const resp = await service.search({
      knowledgeBaseId: cfg.knowledgeBaseId,
      query: stringifyValue(cfg.query),
      topK: cfg.topK,
      threshold: cfg.threshold,
      signal: ctx.signal, // HTTP 级取消（透传到嵌入调用）
    })""", 1)
s = s.replace(
    "      { intervalMs: 500, timeoutMs: 120_000, signal: ctx.signal }",
    "      { intervalMs: WORKFLOW_DEFAULTS.kbIngestPollIntervalMs, timeoutMs: WORKFLOW_DEFAULTS.kbIngestWaitTimeoutMs, signal: ctx.signal }", 1)
s = s.replace(
    "        { intervalMs: 2000, timeoutMs: 300_000, signal: ctx.signal }",
    "        { intervalMs: WORKFLOW_DEFAULTS.imagePollIntervalMs, timeoutMs: WORKFLOW_DEFAULTS.imagePollTimeoutMs, signal: ctx.signal }", 1)
# image 尺寸 fallback 移除（catalog defaultConfig 是唯一默认源）
old = """      width: cfg.width ?? 1024,
      height: cfg.height ?? 1024,"""
assert old in s
s = s.replace(old, """      width: cfg.width,
      height: cfg.height,""", 1)
# import 常量
old = "import { WORKFLOW_RUN_EVENT_CHANNEL } from '@shared/types/workflow.types'"
assert old in s
s = s.replace(old, "import { WORKFLOW_DEFAULTS, WORKFLOW_LIMITS, WORKFLOW_RUN_EVENT_CHANNEL } from '@shared/types/workflow.types'", 1)

# lw eventId 工厂（两处逐字重复 → 一处实现）
old = "/** 信号已取消则抛错（可取消节点的检查点） */"
assert old in s
s = s.replace(old, """/** 长文节点 eventId 工厂（下游 longwriting:generate:{eventId} 事件订阅依赖此格式） */
function makeLwEventId(ctx: WorkflowNodeContext): string {
  return `wf_${ctx.runId}_${ctx.nodeId}_${ctx.iterationIndex}`
}

/** 信号已取消则抛错（可取消节点的检查点） */""", 1)
assert s.count('`wf_${ctx.runId}_${ctx.nodeId}_${ctx.iterationIndex}`') == 2
s = s.replace("const eventId = `wf_${ctx.runId}_${ctx.nodeId}_${ctx.iterationIndex}`",
              "const eventId = makeLwEventId(ctx)")
open(p, 'w', encoding='utf-8').write(s)
print('4. ai-nodes constants done')

# ── 5. http-request 超时双源修复 ──
p = 'src/core/modules/workflow/nodes/task-nodes.ts'
s = open(p, encoding='utf-8').read()
old = "    const timeout = Math.min(cfg.timeoutMs ?? 30_000, 300_000)"
assert old in s
s = s.replace(old, "    const timeout = Math.min(cfg.timeoutMs ?? WORKFLOW_DEFAULTS.httpRequestTimeoutMs, WORKFLOW_LIMITS.httpTimeoutMs)", 1)
old = "import { callAIStream } from '../../../services/ai-call'"
assert old in s
s = s.replace(old, "import { callAIStream } from '../../../services/ai-call'\nimport { WORKFLOW_DEFAULTS, WORKFLOW_LIMITS } from '@shared/types/workflow.types'", 1)
open(p, 'w', encoding='utf-8').write(s)
print('5. http timeout done')

# ── 6. 引擎：truncate 常量命名 + scope key 集中 + 死代码清理 ──
p = 'src/core/modules/workflow/engine/workflow-engine.service.ts'
s = open(p, encoding='utf-8').read()

# truncate 常量
old = """function truncateOutput(
  output: Record<string, unknown>,
  maxChars: number
): Record<string, unknown> {
  try {
    if (JSON.stringify(output).length <= maxChars) return output
  } catch {
    return { __truncated: true }
  }
  const keys = Object.keys(output)
  const perFieldCap = Math.floor((maxChars - 256) / Math.max(1, keys.length))
  if (perFieldCap < 64) {
    return { __truncated: true, keyCount: keys.length, keysPreview: keys.slice(0, 50) }
  }"""
new = """/** 截断算法调优常量（与 maxOutputChars 的关系：预留结构开销 / 单字段下限 / 键名预览数） */
const TRUNCATE_OVERHEAD_CHARS = 256
const TRUNCATE_MIN_FIELD_CHARS = 64
const TRUNCATE_KEY_PREVIEW_COUNT = 50

function truncateOutput(
  output: Record<string, unknown>,
  maxChars: number
): Record<string, unknown> {
  try {
    if (JSON.stringify(output).length <= maxChars) return output
  } catch {
    return { __truncated: true }
  }
  const keys = Object.keys(output)
  const perFieldCap = Math.floor((maxChars - TRUNCATE_OVERHEAD_CHARS) / Math.max(1, keys.length))
  if (perFieldCap < TRUNCATE_MIN_FIELD_CHARS) {
    return { __truncated: true, keyCount: keys.length, keysPreview: keys.slice(0, TRUNCATE_KEY_PREVIEW_COUNT) }
  }"""
assert old in s, 'truncate'
s = s.replace(old, new, 1)

# scope key 集中
old = "/** 执行作用域：根作用域或某循环迭代 */"
assert old in s
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
assert "return this.key === 'root'" in s
s = s.replace("return this.key === 'root'", 'return this.key === ROOT_SCOPE_KEY', 1)
s = s.replace("const scopeKey = `${node.id}:${i}`", 'const scopeKey = makeScopeKey(node.id, i)', 1)
s = s.replace("const loopNodeId = scopeKey.split(':')[0]", 'const loopNodeId = parseScopeLoopNodeId(scopeKey)', 1)

# 死代码：findWaitingScope 恒真条件
old = """  private findWaitingScope(exec: RunExecution): ScopeState | null {
    if (exec.rootScope.states.has) {
      for (const s of exec.rootScope.states.values()) {
        if (s.status === 'waiting_review') return exec.rootScope
      }
    }"""
new = """  private findWaitingScope(exec: RunExecution): ScopeState | null {
    for (const s of exec.rootScope.states.values()) {
      if (s.status === 'waiting_review') return exec.rootScope
    }"""
assert old in s, 'findWaiting'
s = s.replace(old, new, 1)

# 死代码：hydrate 死三元
old = "        status: cp.nodeType === 'loop' ? 'succeeded' : 'succeeded',"
assert old in s
s = s.replace(old, "        status: 'succeeded',", 1)
open(p, 'w', encoding='utf-8').write(s)
print('6. engine constants/dead-code done')

# ── 7. node-handler 拼写 ──
p = 'src/core/modules/workflow/engine/node-handler.ts'
s = open(p, encoding='utf-8').read()
s = s.replace('settle 前自查', 'settle 前自查')
if 'setlle' in s:
    s = s.replace('setlle', 'settle')
open(p, 'w', encoding='utf-8').write(s)
print('7. typo done')

# ── 8. condition 手写 branch: 前缀改用编码函数 ──
p = 'src/core/modules/workflow/nodes/control-nodes.ts'
s = open(p, encoding='utf-8').read()
old = "import { stringifyValue } from '../engine/variable-resolver'"
assert old in s
s = s.replace(old, "import { stringifyValue } from '../engine/variable-resolver'\nimport { encodeWorkflowHandleId } from '@shared/types/workflow.types'", 1)
assert s.count("route: `branch:${br.branchId}`") == 2
s = s.replace("route: `branch:${br.branchId}`",
              "route: encodeWorkflowHandleId('branch', br.branchId)")
open(p, 'w', encoding='utf-8').write(s)
print('8. condition route encoding done')

# ── 9. ReviewRecord 类型对齐超时决策值 ──
p = 'src/core/database/repositories/workflow-node-run.repository.ts'
s = open(p, encoding='utf-8').read()
old = "  decision: 'approve' | 'approve_with_changes' | 'reject'"
assert old in s
s = s.replace(old, "  decision: 'approve' | 'approve_with_changes' | 'reject' | 'timeout_approve' | 'timeout_reject'", 1)
open(p, 'w', encoding='utf-8').write(s)
print('9. review record type done')

# ── 10. boot：ticker 独立常量 + catch 保留 error 对象 ──
p = 'src/core/modules/workflow/workflow-boot.ts'
s = open(p, encoding='utf-8').read()
old = "  }, WORKFLOW_DEFAULTS.cronTickMs)"
assert old in s
s = s.replace(old, "  }, WORKFLOW_DEFAULTS.reviewTimeoutTickMs)", 1)
s = s.replace("// 5. 审核超时 ticker（30s 扫描挂起审核的 wait_expires_at）",
              "// 5. 审核超时 ticker（扫描挂起审核的 wait_expires_at；间隔独立于 cronTick）", 1)
open(p, 'w', encoding='utf-8').write(s)
print('10. boot ticker done')

for path in ['src/electron/index.ts', 'src/web/server/index.ts']:
    s = open(path, encoding='utf-8').read()
    s = s.replace("console.warn('[boot] 工作流子系统启动失败（不致命）:', e?.message ?? e)",
                  "console.warn('[boot] 工作流子系统启动失败（不致命）', e)", 1)
    s = s.replace("console.warn('[web-server] 工作流子系统启动失败（不致命）:', e?.message ?? e)",
                  "console.warn('[web-server] 工作流子系统启动失败（不致命）', e)", 1)
    open(path, 'w', encoding='utf-8').write(s)
print('11. boot catch keep error done')

# ── 12. domain-event-bus 监听上限命名 ──
p = 'src/core/modules/workflow/trigger/domain-event-bus.ts'
s = open(p, encoding='utf-8').read()
old = "    this.emitter.setMaxListeners(50)"
assert old in s
s = s.replace(old, """    // 监听上限：当前订阅方仅调度器 1 个；预留给多模块订阅（超过告警而非静默漏收）
    this.emitter.setMaxListeners(EVENT_BUS_MAX_LISTENERS)""", 1)
old = "class WorkflowDomainEventBus {"
assert old in s
s = s.replace(old, "/** 事件总线监听上限（量级假设见 setMaxListeners 注释） */\nconst EVENT_BUS_MAX_LISTENERS = 50\n\nclass WorkflowDomainEventBus {", 1)
open(p, 'w', encoding='utf-8').write(s)
print('12. bus max listeners done')
