/**
 * ContextManager 单元测试（契约 = 23 号 §5 / 12 号 R6 压缩守恒的执行定义）
 * @module platform/agent-runtime/__tests__/context-manager.spec
 *
 * 覆盖：水位触发与两级阈值夹取 / 剪枝阶段（近端保护/门槛）/ 守恒摘要
 * （用户消息 20K 预算原样保留+时间序 / 摘要置尾 / 非用户消息折叠）/ 估算回填防抖动 /
 * 事件链 start→summary→done / 悬空工具调用哨兵修复（含幂等与配对相邻）/
 * 摘要失败降级纯剪枝 / 无摘要回调的纯剪枝模式 / vendor 件（估算器/剪枝边界）。
 */

import { describe, it, expect, vi } from 'vitest'
import type { ModelMessage } from 'ai'
import {
  ContextManager,
  createContextManager,
  classifyMessage,
  summaryMessage,
  INTERRUPTED_SENTINEL,
  SOFT_WATERMARK,
  HARD_WATERMARK,
  USER_MESSAGE_BUDGET_TOKENS,
  type ContextManagerDeps,
} from '@core/platform/agent-runtime/context/context-manager'
import {
  defaultEstimateTokens,
  pruneToolResults,
  DefaultCompactionStrategy,
} from '@core/platform/agent-runtime/runtime/vendor/compaction'

// ==================== 测试基建 ====================

const user = (t: string): ModelMessage => ({ role: 'user', content: t })
const assistant = (t: string): ModelMessage => ({ role: 'assistant', content: t })
const assistantToolCall = (id: string, name = 'q'): ModelMessage =>
  ({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: id, toolName: name, input: {} }] }) as never
const toolResult = (id: string, result: string): ModelMessage =>
  ({ role: 'tool', content: [{ type: 'tool-result', toolCallId: id, result }] }) as never

function mkManager(over: Partial<ContextManagerDeps> = {}): ContextManager {
  return createContextManager({ contextWindowTokens: 8_000, ...over })
}

/** 事件收集器 */
function collector() {
  const events: Array<{ type: string; phase?: string; tokensBefore?: number; tokensAfter?: number }> = []
  return { events, emit: (e: never) => events.push(e) }
}

// ==================== 水位与阈值 ====================

describe('水位与阈值', () => {
  it('软限触发：估算达 window×0.9 才压缩；未达返回 null 不动历史', async () => {
    const m = mkManager()
    const { soft } = m.thresholds
    expect(soft).toBe(Math.floor(8_000 * SOFT_WATERMARK)) // 7200

    const small = [user('hi'), assistant('ok')]
    expect(await m.maybeCompact({ messages: small, lastInputTokens: 0 })).toBeNull()

    const big = [user('问一个很长的问题'), assistantToolCall('c1'), toolResult('c1', 'y'.repeat(40_000))]
    expect(await m.maybeCompact({ messages: big, lastInputTokens: 0 })).not.toBeNull()
  })

  it('配置夹取：外部软限 >0.9 被夹回 0.9；硬顶不低于软限', () => {
    const m = mkManager({ softWatermark: 0.99 })
    expect(m.thresholds.soft).toBe(Math.floor(8_000 * SOFT_WATERMARK))
    const m2 = mkManager({ softWatermark: 0.5 })
    expect(m2.thresholds.soft).toBe(4_000) // 更保守的配置允许
    expect(m2.thresholds.hard).toBeGreaterThanOrEqual(m2.thresholds.soft)
    const m3 = mkManager()
    expect(m3.thresholds.hard).toBe(Math.floor(8_000 * HARD_WATERMARK))
  })

  it('水位依据取 max(本地估算, 模型实测, 回填值)——模型实测可单独触发', async () => {
    const m = mkManager()
    const msgs = [user('hi')] // 本地估算极小
    const out = await m.maybeCompact({ messages: msgs, lastInputTokens: 9_000 })
    expect(out).not.toBeNull() // 模型侧实测超线即触发（本地估算低估兜底）
  })

  it('非正窗口 fail-fast', () => {
    expect(() => mkManager({ contextWindowTokens: 0 })).toThrow(/contextWindowTokens/)
  })
})

// ==================== 压缩守恒（12 号 R6） ====================

describe('压缩守恒', () => {
  it('用户消息按预算从新到旧原样保留（时间序不变）；assistant/tool 折叠；摘要置尾', async () => {
    const summarize = vi.fn(async (text: string) => `摘要[${text.slice(0, 10)}…]`)
    const m = mkManager({ summarize })
    const messages: ModelMessage[] = [
      user('最早的问题'),
      assistant('最早的回答' + '详'.repeat(20_000)), // 体量主要在 assistant（剪枝不作用于它→摘要阶段触发）
      toolResult('c1', 'z'.repeat(30_000)),
      user('中间的问题'),
      assistant('中间的回答' + '情'.repeat(20_000)),
      user('最近的问题'),
    ]
    const out = await m.maybeCompact({ messages, lastInputTokens: 0 })
    expect(out).not.toBeNull()
    // 结构：保留的用户消息（时间序，20K 预算内全部存活） + 摘要（置尾）。
    // 预算耗尽场景由下一条用例（可控估算器）覆盖
    const users = out!.filter((x) => classifyMessage(x) === 'user' && !String(x.content).startsWith('[Previous'))
    expect(users.map((x) => x.content)).toEqual(['最早的问题', '中间的问题', '最近的问题'])
    const tail = out![out!.length - 1]
    expect(classifyMessage(tail)).toBe('compaction.summary')
    // assistant/工具消息全部折叠（不再出现）
    expect(out!.some((x) => x.role === 'assistant')).toBe(false)
    expect(out!.some((x) => x.role === 'tool')).toBe(false)
    expect(summarize).toHaveBeenCalled()
  })

  it('超预算的老用户消息也被折叠（预算 20K 缺省；预算内从新到旧）', async () => {
    const summarize = vi.fn(async () => 'S')
    // 估算器可控：每条用户消息记 12_000 tokens（>预算/2）→ 只保留最新 1 条
    const estimate = () => 12_000
    const m = mkManager({ summarize, estimateTokens: estimate, userMessageBudgetTokens: USER_MESSAGE_BUDGET_TOKENS })
    const messages = [user('旧'), assistant('a'), user('新')]
    const out = await m.maybeCompact({ messages, lastInputTokens: 0 })
    const users = out!.filter((x) => classifyMessage(x) === 'user' && !String(x.content).startsWith('[Previous'))
    expect(users.map((x) => x.content)).toEqual(['新'])
  })

  it('估算回填防抖动：压缩后立即复查（估算未再涨）不再触发', async () => {
    const summarize = vi.fn(async () => 'S')
    const m = mkManager({ summarize })
    const messages = [user('q'), toolResult('c1', 'y'.repeat(40_000))]
    const first = await m.maybeCompact({ messages, lastInputTokens: 0 })
    expect(first).not.toBeNull()
    // 模型实测为 0（尚未调用）、本地估算已因折叠骤降、回填值=压缩后估算 → 不触发
    const again = await m.maybeCompact({ messages: first!, lastInputTokens: 0 })
    expect(again).toBeNull()
  })

  it('事件链：start → summary → done（tokensBefore/After 携带）', async () => {
    const { events, emit } = collector()
    const m = mkManager({ summarize: async () => 'S', emit: emit as never })
    await m.maybeCompact({ messages: [user('q'), toolResult('c1', 'y'.repeat(40_000))], lastInputTokens: 0 })
    expect(events.map((e) => `${e.type}:${e.phase ?? ''}`)).toEqual([
      'compaction:start',
      'compaction:summary',
      'compaction:done',
    ])
    expect(events[0].tokensBefore).toBeGreaterThan(0)
    expect(events[2].tokensAfter).toBeLessThan(events[0].tokensBefore!)
  })

  it('摘要失败降级纯剪枝（压缩是优化不是正确性依赖）：warn 留痕、done 仍达', async () => {
    const { events, emit } = collector()
    const m = mkManager({
      summarize: () => Promise.reject(new Error('summarizer down')),
      emit: emit as never,
    })
    const messages = [
      user('q1'),
      assistantToolCall('c1'),
      toolResult('c1', 'y'.repeat(20_000)), // 旧工具（保护带外 → 剪枝）
      assistant('mid'),
      assistantToolCall('c2'),
      toolResult('c2', 'y'.repeat(36_000)), // 近端工具（≈9000 tok 独自撑起 8000 保护带 → c1 落在带外可剪）
      user('q2'),
    ]
    const out = await m.maybeCompact({ messages, lastInputTokens: 0 })
    expect(out).not.toBeNull()
    expect(events.map((e) => e.phase)).toEqual(['start', 'done']) // 无 summary 事件
    // 剪枝生效：保护带外的旧工具结果被替换为 [pruned]，近端 c2 原样保留
    const json = JSON.stringify(out)
    expect(json).toContain('[pruned]')
    expect(json).toContain('y'.repeat(200)) // c2 内容仍在
  })

  it('无摘要回调：纯剪枝模式（合法压缩器）', async () => {
    const m = mkManager() // 不注入 summarize
    const messages = [
      user('q1'),
      assistantToolCall('c1'),
      toolResult('c1', 'y'.repeat(20_000)),
      assistant('mid'),
      assistantToolCall('c2'),
      toolResult('c2', 'y'.repeat(36_000)),
      user('q2'),
    ]
    const out = await m.maybeCompact({ messages, lastInputTokens: 0 })
    expect(out).not.toBeNull()
    const json = JSON.stringify(out)
    expect(json).toContain('[pruned]')
    expect(json).toContain('y'.repeat(200))
  })
})

// ==================== 悬空工具调用修复（崩溃恢复） ====================

describe('assemble：悬空哨兵修复', () => {
  it('悬空 tool-call 补哨兵结果（配对相邻）；完整历史返回原引用', () => {
    const m = mkManager()
    const ok: ModelMessage[] = [user('q'), assistantToolCall('c1'), toolResult('c1', 'r'), assistant('a')]
    expect(m.assemble(ok)).toBe(ok) // 无悬空：原引用（调用方跳过落盘）

    const dangling: ModelMessage[] = [user('q'), assistantToolCall('c1'), user('再来')]
    const repaired = m.assemble(dangling)
    expect(repaired).not.toBe(dangling)
    // 哨兵紧跟悬空 assistant（配对相邻），其后才是下一条用户消息
    expect(repaired[1]).toBe(dangling[1])
    const sentinel = repaired[2]
    expect(sentinel.role).toBe('tool')
    expect(JSON.stringify(sentinel)).toContain(INTERRUPTED_SENTINEL)
    expect(JSON.stringify(sentinel)).toContain('"c1"')
    expect(repaired[3]).toBe(dangling[2])
    // 幂等：修复后再装配不再变化
    expect(m.assemble(repaired)).toBe(repaired)
  })

  it('多个悬空 id（一次多工具调用部分崩溃）全部补齐', () => {
    const m = mkManager()
    const dangling: ModelMessage[] = [
      user('q'),
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: 'a', toolName: 't', input: {} },
          { type: 'tool-call', toolCallId: 'b', toolName: 't', input: {} },
        ],
      } as never,
      toolResult('a', 'ok'), // b 悬空
    ]
    const repaired = m.assemble(dangling)
    const sentinel = repaired[2]
    expect(JSON.stringify(sentinel)).toContain('"b"')
    expect(JSON.stringify(sentinel)).not.toContain('"a"') // a 已应答不重复
  })
})

// ==================== 纯函数与 vendor 件 ====================

describe('classifyMessage / summaryMessage', () => {
  it('摘要前缀识别 compaction.summary；普通消息按 role', () => {
    expect(classifyMessage(summaryMessage('S'))).toBe('compaction.summary')
    expect(classifyMessage(user('普通'))).toBe('user')
    expect(classifyMessage(assistant('a'))).toBe('assistant')
    expect(classifyMessage(toolResult('c', 'r'))).toBe('tool')
  })
})

describe('vendor 件（open-harness 移植）', () => {
  it('defaultEstimateTokens：UTF-8 字节/4（中文 3 字节/字）', () => {
    expect(defaultEstimateTokens([{ role: 'user', content: 'aaaa' }])).toBeGreaterThan(0)
    // 中文估算大于同长度 ASCII（字节口径）
    const ascii = defaultEstimateTokens([user('abcdefgh')])
    const cjk = defaultEstimateTokens([user('八个汉字了呀')])
    expect(cjk).toBeGreaterThan(ascii)
  })

  it('pruneToolResults：近端保护（保护边界内不剪）+ 门槛不足整体放弃', () => {
    const messages: ModelMessage[] = [
      user('q'),
      assistantToolCall('c1'),
      toolResult('c1', 'x'.repeat(24_000)), // ≈6000 tokens（估算器为字节/4）
      assistant('mid'),
      user('new'),
    ]
    // 门槛 4000 tokens：剪它省 ≈6000 → 生效
    // 保护预算 10 tokens：边界落在工具消息之前（尾部 user+assistant 累计已 ≥10）→ 工具可剪
    const pruned = pruneToolResults(messages, 10, 4_000, defaultEstimateTokens)
    expect(pruned.tokensSaved).toBeGreaterThan(0)
    expect(JSON.stringify(pruned.messages)).toContain('[pruned]')

    // 门槛高于可省：整体放弃返回原数组
    const none = pruneToolResults(messages, 10, 100_000, defaultEstimateTokens)
    expect(none.tokensSaved).toBe(0)
    expect(none.messages).toBe(messages)

    // 近端保护：protectedTokens 覆盖工具消息位置 → 不剪
    const protectedResult = pruneToolResults(messages, 100_000, 4_000, defaultEstimateTokens)
    expect(JSON.stringify(protectedResult.messages)).not.toContain('[pruned]')
  })

  it('DefaultCompactionStrategy：纯剪枝路径达到门槛即返回（不调摘要）', async () => {
    // 保护预算 5：末条 user('new') 独自 ≥5 → 边界落在它上（idx4）→ 此前的工具可剪
    const strategy = new DefaultCompactionStrategy({ minPruneSavings: 1_000, protectedTokens: 5 })
    const messages: ModelMessage[] = [
      user('q'),
      assistantToolCall('c1'),
      toolResult('c1', 'x'.repeat(8_000)),
      user('new'),
    ]
    const result = await strategy.compact({
      messages,
      totalTokens: defaultEstimateTokens(messages),
      targetTokens: 100,
    })
    expect(result.summary).toBeUndefined()
    expect(result.tokensPruned).toBeGreaterThan(0)
  })
})
