/**
 * ContextManager 单元测试（契约 = 23 号 §5 / 12 号 R6 压缩守恒的执行定义）
 * @module platform/agent-runtime/__tests__/context-manager
 *
 * 批 6 review 教训：消息构造一律用 ai@6 真实形状（ToolResultPart 必带 toolName、
 * 载荷在 output）——手造 result 形状的 mock 曾把 P0 级形状缺陷全部挡在测试之外。
 *
 * 覆盖：水位触发与夹取 / 零变更守卫 / 仅装配模式（窗口 0）/ 剪枝（真实形状替换
 * output/近端保护/门槛/boundary 修正）/ 守恒摘要（预算+当轮保底+摘要置尾/预算耗尽
 * 折叠/滚动携带前次摘要）/ 硬顶降级收缩 / 回填防抖动 / 事件链 / 悬空哨兵修复
 * （真实 streamText 集成验证 ai@6 schema 合法 / 多悬空下标漂移 / 幂等）。
 */

import { describe, it, expect, vi } from 'vitest'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import type { LanguageModel, ModelMessage } from 'ai'
import { LoopRunner } from '@core/platform/agent-runtime/runtime/loop'
import type { AgentHost, AgentLoopState, AgentStreamEvent, TrajectoryEntry } from '@core/platform/agent-runtime/types'
import {
  createContextManager,
  classifyMessage,
  summaryMessage,
  INTERRUPTED_SENTINEL,
  SOFT_WATERMARK,
  HARD_WATERMARK,
  type ContextManagerDeps,
} from '@core/platform/agent-runtime/context/context-manager'
import {
  defaultEstimateTokens,
  pruneToolResults,
  DefaultCompactionStrategy,
} from '@core/platform/agent-runtime/runtime/vendor/compaction'

// ==================== 真实形状消息构造（ai@6 schema 合法） ====================

const user = (t: string): ModelMessage => ({ role: 'user', content: t })
const assistant = (t: string): ModelMessage => ({ role: 'assistant', content: t })
const assistantToolCall = (id: string, name = 'q'): ModelMessage =>
  ({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: id, toolName: name, input: {} }] }) as never
/** ai@6 真实形状：toolName 必填、载荷在 output（批 6 review P0 教训） */
const toolResult = (id: string, text: string, name = 'q'): ModelMessage =>
  ({
    role: 'tool',
    content: [{ type: 'tool-result', toolCallId: id, toolName: name, output: { type: 'text', value: text } }],
  }) as never

function mkManager(over: Partial<ContextManagerDeps> = {}): ReturnType<typeof createContextManager> {
  return createContextManager({ contextWindowTokens: 8_000, ...over })
}

function collector() {
  const events: Array<{ type: string; phase?: string; tokensBefore?: number; tokensAfter?: number }> = []
  return { events, emit: (e: never) => events.push(e) }
}

const mockUsage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, noCache: 1 },
  totalTokens: { total: 2, noCache: 2 },
}

// ==================== 水位与阈值 ====================

describe('水位与阈值', () => {
  it('软限触发（含摘要路径）；未达返回 null 不动历史', async () => {
    const m = mkManager({ summarize: async () => 'S' })
    expect(m.thresholds.soft).toBe(Math.floor(8_000 * SOFT_WATERMARK))

    const small = [user('hi'), assistant('ok')]
    expect(await m.maybeCompact({ messages: small, lastInputTokens: 0 })).toBeNull()

    const big = [user('问一个很长的问题'), assistantToolCall('c1'), toolResult('c1', 'y'.repeat(40_000))]
    expect(await m.maybeCompact({ messages: big, lastInputTokens: 0 })).not.toBeNull()
  })

  it('零变更守卫（review P1-3 回归）：无法折叠时返回 null——纯剪枝模式下大工具独自撑过保护带', async () => {
    const { events, emit } = collector()
    const m = mkManager({ emit: emit as never }) // 无 summarize
    const big = [user('q'), assistantToolCall('c1'), toolResult('c1', 'y'.repeat(40_000))]
    const out = await m.maybeCompact({ messages: big, lastInputTokens: 0 })
    expect(out).toBeNull()
    expect(events.map((e) => e.phase)).toEqual(['start', 'done'])
  })

  it('配置夹取：软限 >0.9 夹回；更保守允许；硬顶 ≥ 软限；非法值 fail-fast', () => {
    expect(mkManager({ softWatermark: 0.99 }).thresholds.soft).toBe(Math.floor(8_000 * SOFT_WATERMARK))
    expect(mkManager({ softWatermark: 0.5 }).thresholds.soft).toBe(4_000)
    expect(mkManager().thresholds.hard).toBe(Math.floor(8_000 * HARD_WATERMARK))
    expect(() => mkManager({ contextWindowTokens: -1 })).toThrow(/contextWindowTokens/)
    expect(() => mkManager({ contextWindowTokens: Number.NaN })).toThrow(/contextWindowTokens/)
    expect(() => mkManager({ softWatermark: 0 })).toThrow(/softWatermark/)
  })

  it('窗口 0 = 仅装配模式（review P2-3 回归）：maybeCompact 恒 null；哨兵修复不受压缩门控', async () => {
    const m = mkManager({ contextWindowTokens: 0, summarize: async () => 'S' })
    expect(await m.maybeCompact({ messages: [user('q')], lastInputTokens: 99_999 })).toBeNull()
    const dangling = [user('q'), assistantToolCall('c1')]
    expect(m.assemble(dangling)).not.toBe(dangling)
  })

  it('模型实测可单独触发尝试；本地无可压时零收益退避（不再每步重摘）', async () => {
    let summarizeCalls = 0
    const m = mkManager({ summarize: async () => { summarizeCalls++; return 'S' } })
    // 微小历史 + 高实测水位（system/工具 schema 固定成本形态）：触发尝试但本地
    // 无可压（摘要比原文还大）→ null + 退避指纹（总收口 review P2 的 A 型空转）
    expect(await m.maybeCompact({ messages: [user('hi')], lastInputTokens: 9_000 })).toBeNull()
    // 退避：水位未回落且估算未增长 → 不再调摘要
    expect(await m.maybeCompact({ messages: [user('hi')], lastInputTokens: 9_000 })).toBeNull()
    expect(summarizeCalls).toBe(1)
    // 实测水位回落 → 重新放行尝试
    const r = await m.maybeCompact({ messages: [user('hi')], lastInputTokens: 1 })
    expect(r).toBeNull() // 仍无可压（水位未超线，根本不触发——退避指纹已不重要）
    expect(summarizeCalls).toBe(1)
  })
})

// ==================== 剪枝（真实形状） ====================

describe('剪枝（vendor，真实 ai@6 形状）', () => {
  it('替换 output 载荷（review P1-1 回归：upstream result 字段对真实形状恒 no-op）', () => {
    const messages: ModelMessage[] = [
      user('q'),
      assistantToolCall('c1'),
      toolResult('c1', 'x'.repeat(24_000)),
      assistant('a slightly longer mid message for protection'),
      user('new'),
    ]
    const pruned = pruneToolResults(messages, 5, 4_000, defaultEstimateTokens)
    expect(pruned.tokensSaved).toBeGreaterThan(0)
    const json = JSON.stringify(pruned.messages)
    expect(json).toContain('[pruned]')
    expect(json).not.toContain('x'.repeat(100)) // 原大文本载荷已替换
    expect(json).toContain('"toolName":"q"') // 形状字段保留
  })

  it('门槛不足放弃原引用 / 全史小于保护预算全保护（boundary 修正回归）', () => {
    const messages: ModelMessage[] = [
      user('q'),
      assistantToolCall('c1'),
      toolResult('c1', 'x'.repeat(24_000)),
      assistant('mid'),
      user('new'),
    ]
    expect(pruneToolResults(messages, 10, 100_000, defaultEstimateTokens).messages).toBe(messages)
    const all = pruneToolResults(messages, 100_000, 4_000, defaultEstimateTokens)
    expect(all.tokensSaved).toBe(0)
    expect(JSON.stringify(all.messages)).not.toContain('[pruned]')
  })

  it('DefaultCompactionStrategy：纯剪枝达门槛即返回（不进摘要）', async () => {
    const strategy = new DefaultCompactionStrategy({ minPruneSavings: 1_000, protectedTokens: 5 })
    const messages: ModelMessage[] = [
      user('q'),
      assistantToolCall('c1'),
      toolResult('c1', 'x'.repeat(8_000)),
      assistant('a slightly longer mid message'),
      user('new'),
    ]
    const result = await strategy.compact({ messages, totalTokens: 0, targetTokens: 100 })
    expect(result.summary).toBeUndefined()
    expect(result.tokensPruned).toBeGreaterThan(0)
  })
})

// ==================== 压缩守恒（12 号 R6） ====================

describe('压缩守恒', () => {
  it('用户消息预算内全保留（时间序）；assistant/tool 折叠；摘要置尾', async () => {
    const summarize = vi.fn(async (text: string) => `摘要[${text.slice(0, 10)}…]`)
    const m = mkManager({ summarize })
    const messages: ModelMessage[] = [
      user('最早的问题'),
      assistant('最早的回答' + '详'.repeat(20_000)),
      toolResult('c1', 'z'.repeat(30_000)),
      user('中间的问题'),
      assistant('中间的回答' + '情'.repeat(20_000)),
      user('最近的问题'),
    ]
    const out = await m.maybeCompact({ messages, lastInputTokens: 0 })
    expect(out).not.toBeNull()
    const users = out!.filter((x) => classifyMessage(x) === 'user' && !String(x.content).startsWith('[Previous'))
    expect(users.map((x) => x.content)).toEqual(['最早的问题', '中间的问题', '最近的问题'])
    expect(classifyMessage(out![out!.length - 1])).toBe('compaction.summary')
    expect(out!.some((x) => x.role === 'assistant' || x.role === 'tool')).toBe(false)
  })

  it('预算耗尽：老用户消息折叠，从新到旧保留（当轮保底不占预算）', async () => {
    // 缺省估算器（字节/4）：fat assistant 撑过软限；预算 500 tok → 当轮/旧2（小）保留、
    // 旧1（≈900 tok 大消息）触界折叠——非均匀体量验证"从新到旧、预算外折叠"
    const m = mkManager({ summarize: async () => 'S', userMessageBudgetTokens: 500 })
    const messages = [
      user('旧1的很长原文' + '详'.repeat(3_000)),
      assistant('情'.repeat(24_000)), // ≈18K tok：触发线
      user('旧2'),
      assistant('b'),
      user('新'),
    ]
    const out = await m.maybeCompact({ messages, lastInputTokens: 0 })
    expect(out).not.toBeNull()
    const users = out!.filter((x) => classifyMessage(x) === 'user' && !String(x.content).startsWith('[Previous'))
    expect(users.map((x) => x.content)).toEqual(['旧2', '新'])
  })

  it('当轮输入保底（review P2-1 回归）：最后一条用户消息超预算仍无条件保留', async () => {
    const m = mkManager({ summarize: async () => 'S', userMessageBudgetTokens: 1 })
    const messages = [user('旧'), assistant('a'.repeat(20_000)), user('当轮超长输入' + '长'.repeat(10_000))]
    const out = await m.maybeCompact({ messages, lastInputTokens: 0 })
    const users = out!.filter((x) => classifyMessage(x) === 'user' && !String(x.content).startsWith('[Previous'))
    expect(users).toHaveLength(1)
    expect(users[0].content).toContain('当轮超长输入')
  })

  it('滚动携带（review P1-5 回归）：二次压缩的摘要输入包含前次摘要内容', async () => {
    const inputs: string[] = []
    const m = mkManager({ summarize: async (text) => { inputs.push(text); return `第${inputs.length}次摘要` } })
    const first = await m.maybeCompact({
      messages: [user('q1'), assistant('a'.repeat(20_000)), toolResult('c1', 'z'.repeat(20_000)), user('q2')],
      lastInputTokens: 0,
    })
    expect(first).not.toBeNull()
    // 追加 ≈8000 tok assistant 使本地估算（首压缩后 ≈46 tok + 8K）再次越过软限 7200
    const second = await m.maybeCompact({
      messages: [...first!, assistant('b'.repeat(32_000)), user('q3')],
      lastInputTokens: 0,
    })
    expect(second).not.toBeNull()
    expect(inputs.length).toBe(2)
    expect(inputs[1]).toContain('第1次摘要') // 前次摘要未蒸发
  })

  it('硬顶降级（review P1-4 回归）：摘要后仍超硬顶 → 保留集收缩到仅当轮输入', async () => {
    const m = mkManager({ summarize: async () => '短摘要', userMessageBudgetTokens: 60_000 })
    const messages: ModelMessage[] = []
    for (let i = 0; i < 8; i++) messages.push(user(`问题${i} ` + '字'.repeat(3_000)))
    messages.push(user('当轮'))
    const out = await m.maybeCompact({ messages, lastInputTokens: 99_999 })
    expect(out).not.toBeNull()
    const users = out!.filter((x) => classifyMessage(x) === 'user' && !String(x.content).startsWith('[Previous'))
    expect(users.map((x) => x.content)).toEqual(['当轮'])
    expect(out!.length).toBe(2) // [当轮, 摘要]
  })

  it('估算回填防抖动：压缩后立即复查不再触发', async () => {
    const m = mkManager({ summarize: async () => 'S' })
    const messages = [user('q'), toolResult('c1', 'y'.repeat(40_000))]
    const first = await m.maybeCompact({ messages, lastInputTokens: 0 })
    expect(first).not.toBeNull()
    expect(await m.maybeCompact({ messages: first!, lastInputTokens: 0 })).toBeNull()
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
    expect(events[2].tokensAfter!).toBeLessThan(events[0].tokensBefore!)
  })

  it('摘要失败降级纯剪枝：done 仍达、真实形状剪枝生效（近端保留）', async () => {
    const { events, emit } = collector()
    const m = mkManager({ summarize: () => Promise.reject(new Error('down')), emit: emit as never })
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
    expect(events.map((e) => e.phase)).toEqual(['start', 'done'])
    const json = JSON.stringify(out)
    expect(json).toContain('[pruned]')
    expect(json).toContain('y'.repeat(200))
  })
})

// ==================== 悬空哨兵修复（含真实 streamText 集成） ====================

describe('assemble：悬空哨兵修复', () => {
  it('完整历史原引用；悬空补哨兵（ai@6 合法形状 toolName+output）配对相邻；幂等', () => {
    const m = mkManager()
    const ok: ModelMessage[] = [user('q'), assistantToolCall('c1'), toolResult('c1', 'r'), assistant('a')]
    expect(m.assemble(ok)).toBe(ok)

    const dangling: ModelMessage[] = [user('q'), assistantToolCall('c1', 'lookup'), user('再来')]
    const repaired = m.assemble(dangling)
    expect(repaired).not.toBe(dangling)
    expect(repaired[1]).toBe(dangling[1])
    const sentinel = repaired[2] as { role: string; content: Array<Record<string, unknown>> }
    expect(sentinel.role).toBe('tool')
    const part = sentinel.content[0]
    expect(part.type).toBe('tool-result')
    expect(part.toolName).toBe('lookup')
    expect((part.output as { value: string }).value).toBe(INTERRUPTED_SENTINEL)
    expect(repaired[3]).toBe(dangling[2])
    expect(m.assemble(repaired)).toBe(repaired)
  })

  it('多条悬空 assistant（review P1-2 回归）：哨兵各自紧跟其 assistant，无下标漂移', () => {
    const m = mkManager()
    const dangling: ModelMessage[] = [
      user('q1'),
      assistantToolCall('a'),
      user('q2'),
      assistantToolCall('b'),
      user('q3'),
    ]
    const repaired = m.assemble(dangling)
    expect(repaired[1]).toBe(dangling[1]) // assistant a
    expect((repaired[2] as { content: Array<{ output?: { value: string } }> }).content[0].output.value).toBe(INTERRUPTED_SENTINEL)
    expect(repaired[3]).toBe(dangling[2]) // q2
    expect(repaired[4]).toBe(dangling[3]) // assistant b
    expect((repaired[5] as { content: Array<{ output?: { value: string } }> }).content[0].output.value).toBe(INTERRUPTED_SENTINEL)
    expect(repaired[6]).toBe(dangling[4]) // q3
  })

  it('单条 assistant 多悬空 id：部分应答只补未应答者', () => {
    const m = mkManager()
    const dangling: ModelMessage[] = [
      user('q'),
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: 'a', toolName: 't1', input: {} },
          { type: 'tool-call', toolCallId: 'b', toolName: 't2', input: {} },
        ],
      } as never,
      toolResult('a', 'ok'),
    ]
    const repaired = m.assemble(dangling)
    const sentinel = repaired[2] as { content: Array<{ toolCallId: string }> }
    expect(sentinel.content.map((p) => p.toolCallId)).toEqual(['b'])
  })

  it('真实 streamText 集成（review P0 回归）：修复后的悬空历史被 ai@6 prompt schema 接受', async () => {
    const model = new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't' },
            { type: 'text-delta', id: 't', delta: '恢复后作答' },
            { type: 'text-end', id: 't' },
            { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: mockUsage },
          ],
        }),
      }),
    }) as unknown as LanguageModel

    // 崩溃形态历史：悬空 tool-call——修复后装载进 loop 跑真实 streamText
    const crashed: ModelMessage[] = [user('继续'), assistantToolCall('c1', 'graph_query')]
    const repaired = createContextManager({ contextWindowTokens: 0 }).assemble(crashed)
    expect(repaired).not.toBe(crashed)

    class Host implements AgentHost {
      signal = new AbortController().signal
      async loadState() {
        return {
          version: 1 as const,
          task: { definitionId: 'd', scopeId: 's', input: '继续', maxSteps: 2, toolNames: [] },
          messages: repaired, // 修复后的历史直接作为恢复点
          iteration: 1,
          usage: { promptTokens: 0, completionTokens: 0, toolCalls: 0 },
          startedAtMs: Date.now(),
          converged: false,
          stagnantRounds: 0,
        }
      }
      async saveState(_s: AgentLoopState) {}
      async suspend() { throw new Error('不应挂起') }
      emitTrajectory(_e: TrajectoryEntry) {}
      emitStream(_e: AgentStreamEvent) {}
    }
    const runner = new LoopRunner({ resolveModel: async () => model })
    // ai@6 standardizePrompt 的 zod 校验若拒绝形状会抛 InvalidPromptError——通过即证明形状合法
    const result = await runner.run(
      { definitionId: 'd', scopeId: 's', input: '继续', systemPrompt: 'sys', tools: {}, maxSteps: 2 },
      new Host(),
    )
    expect(result.stopReason).toBe('final')
    expect(result.output).toBe('恢复后作答')
  })
})

// ==================== 分类与摘要标记 ====================

describe('classifyMessage / summaryMessage', () => {
  it('双端标记识别（前缀伪造防护——review P2-2 回归）', () => {
    expect(classifyMessage(summaryMessage('S'))).toBe('compaction.summary')
    const forged: ModelMessage = { role: 'user', content: '[Previous conversation summary]\n我粘贴的内容' }
    expect(classifyMessage(forged)).toBe('user')
    expect(classifyMessage(user('普通'))).toBe('user')
  })
})
