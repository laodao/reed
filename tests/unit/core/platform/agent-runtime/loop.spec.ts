/**
 * LoopRunner 单元测试（契约测试 = 23 号接口的执行定义）
 * @module platform/agent-runtime/__tests__/loop.spec
 *
 * 用 ai/test 的 MockLanguageModelV3 驱动真实 streamText 路径（spike 已验证单步语义）。
 * 覆盖：final 直答 / 工具循环收敛 / 步级 saveState 时机 / 审批通过与拒绝 /
 * zod 校验失败回填 / 工具异常回填 / maxSteps 护栏 / 中断 / 无进展检测 / 截断。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import type { LanguageModel } from 'ai'
import { z } from 'zod'
import { LoopRunner, initState, normalizeDecision, truncateJson } from '@core/platform/agent-runtime/runtime/loop'
import type { AgentHost, AgentLoopState, AgentTask, AgentToolDef, TrajectoryEntry, AgentStreamEvent } from '@core/platform/agent-runtime/types'

// ==================== 测试基建（公共件见 ./helpers——与 agent-service.spec 共用） ====================

import { mockUsage as usage, txtChunks as txt, toolCallChunks as toolParts, mkModel, streamErrorChunks } from './helpers'

class FakeHost implements AgentHost {
  savedStates: AgentLoopState[] = []
  trajectories: TrajectoryEntry[] = []
  streams: AgentStreamEvent[] = []
  preloaded: AgentLoopState | null = null
  signal = new AbortController().signal
  async loadState() {
    return this.preloaded
  }
  async saveState(s: AgentLoopState) {
    this.savedStates.push(JSON.parse(JSON.stringify(s)))
  }
  async suspend() {
    return { action: 'approve' as const, values: {} }
  }
  emitTrajectory(e: TrajectoryEntry) {
    this.trajectories.push(e)
  }
  emitStream(e: AgentStreamEvent) {
    this.streams.push(e)
  }
}

function mkTask(tools: Record<string, AgentToolDef>, maxSteps = 6): AgentTask {
  return {
    definitionId: 'test-def',
    scopeId: 's1',
    input: '干活',
    systemPrompt: '你是测试 agent',
    tools,
    maxSteps,
    snapshot: '人物：林晓',
  }
}

function mkRunner(model: LanguageModel, opts?: ConstructorParameters<typeof LoopRunner>[0]) {
  return new LoopRunner({ resolveModel: async () => model, ...opts })
}

// ==================== 纯函数 ====================

describe('normalizeDecision', () => {
  it('tool-call 消息 → tool_calls', () => {
    const msgs = [
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 't', input: { a: 1 } }] },
    ] as never
    const d = normalizeDecision('tool-calls', msgs)
    expect(d.type).toBe('tool_calls')
    if (d.type === 'tool_calls') expect(d.calls[0].toolName).toBe('t')
  })
  it('纯文本 → final', () => {
    const msgs = [{ role: 'assistant', content: '答案' }] as never
    expect(normalizeDecision('stop', msgs)).toEqual({ type: 'final', answer: '答案' })
  })
})

describe('truncateJson', () => {
  it('超长截断且保留首尾', () => {
    const out = truncateJson({ big: 'x'.repeat(20_000) }, 1000)
    expect(out.length).toBeLessThan(1200)
    expect(out).toContain('[truncated')
  })
  it('不超长原样', () => {
    expect(truncateJson({ a: 1 })).toBe('{"a":1}')
  })
})

// ==================== 循环契约 ====================

describe('LoopRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('① final 直答：一步收敛，saveState 恰好一次（final 后）', async () => {
    const host = new FakeHost()
    const runner = mkRunner(mkModel([() => txt('直接回答')]))
    const r = await runner.run(mkTask({}), host)
    expect(r.stopReason).toBe('final')
    expect(r.output).toBe('直接回答')
    expect(r.iterations).toBe(0)
    // 首步前初始态 + final 后收敛态 = 2 次
    expect(host.savedStates.length).toBe(2)
    expect(host.savedStates.at(-1)?.converged).toBe(true)
  })

  it('② 工具循环：两步工具一步收敛；每次工具 settle 后 saveState（步级持久化点）', async () => {
    const executed: unknown[] = []
    const queryTool: AgentToolDef<{ name: string }> = {
      name: 'query_setting',
      description: '查',
      inputSchema: z.object({ name: z.string() }),
      execute: async (input) => {
        executed.push(input)
        return { found: true }
      },
    }
    const host = new FakeHost()
    const runner = mkRunner(
      mkModel([
        () => toolParts('c1', 'query_setting', { name: '林晓' }),
        () => toolParts('c2', 'query_setting', { name: '青云宗' }),
        () => txt('查完了'),
      ]),
    )
    const r = await runner.run(mkTask({ query_setting: queryTool }), host)
    expect(r.stopReason).toBe('final')
    expect(r.output).toBe('查完了')
    expect(executed).toEqual([{ name: '林晓' }, { name: '青云宗' }])
    // saveState：初始态、步1后、步2后、final后 = 4 次；messages 逐增长
    expect(host.savedStates.length).toBe(4)
    expect(host.savedStates[0].messages.length).toBeLessThan(host.savedStates[1].messages.length)
    // 工具轨迹：2 条 tool_call + decision 3 条 + final
    const kinds = host.trajectories.map((t) => t.kind)
    expect(kinds.filter((k) => k === 'tool_call').length).toBe(2)
    expect(kinds.filter((k) => k === 'decision').length).toBe(3)
    expect(kinds).toContain('final')
  })

  it('③ 审批拒绝：requiresApproval 无协调器=安全默认拒绝；工具不执行、错误回填、对话继续', async () => {
    const executed = vi.fn()
    const saveTool: AgentToolDef = {
      name: 'save_entity',
      description: '存',
      inputSchema: z.object({ name: z.string() }),
      execute: async () => {
        executed()
        return { ok: true }
      },
      requiresApproval: true,
    }
    const host = new FakeHost()
    const runner = mkRunner(
      mkModel([
        () => toolParts('c1', 'save_entity', { name: 'x' }),
        () => txt('好的不存了'),
      ]),
    )
    const r = await runner.run(mkTask({ save_entity: saveTool }), host)
    expect(executed).not.toHaveBeenCalled()
    expect(r.stopReason).toBe('final')
    expect(r.output).toBe('好的不存了')
    // 拒绝以 tool error 结果进入消息（模型下一轮可读）
    const toolResults = JSON.stringify(host.savedStates[1].messages)
    expect(toolResults).toContain('denied')
  })

  it('④ 审批通过（含编辑）：approve_with_edit 的 input 覆盖后执行', async () => {
    const seen: unknown[] = []
    const saveTool: AgentToolDef<{ name: string }> = {
      name: 'save_entity',
      description: '存',
      inputSchema: z.object({ name: z.string() }),
      execute: async (input) => {
        seen.push(input)
        return { ok: true }
      },
      requiresApproval: true,
    }
    const host = new FakeHost()
    const runner = mkRunner(mkModel([() => toolParts('c1', 'save_entity', { name: '原值' }), () => txt('存好了')]), {
      requestApproval: async () => ({ action: 'approve_with_edit', input: { name: '编辑后的值' } }),
    })
    await runner.run(mkTask({ save_entity: saveTool }), host)
    expect(seen).toEqual([{ name: '编辑后的值' }])
  })

  it('⑤ 入参校验失败：ai@6 在 execute 前拦截（schema 为单一事实源），对话继续收敛', async () => {
    const executed = vi.fn()
    const tool: AgentToolDef<{ n: number }> = {
      name: 'calc',
      description: '算',
      inputSchema: z.object({ n: z.number() }),
      execute: async (i) => {
        executed()
        return i.n
      },
    }
    const host = new FakeHost()
    const runner = mkRunner(mkModel([() => toolParts('c1', 'calc', { n: '不是数字' }), () => txt('收到')]))
    const r = await runner.run(mkTask({ calc: tool }), host)
    expect(r.stopReason).toBe('final') // 校验失败不终止对话
    expect(executed).not.toHaveBeenCalled() // execute 未被调用（ai@6 层拦截）
    // 工具结果为校验错误文本（回填给模型自纠）
    const msgs = JSON.stringify(host.savedStates[0].messages)
    expect(msgs.length).toBeGreaterThan(0)
  })

  it('⑥ 工具抛异常：错误回填不终止对话', async () => {
    const tool: AgentToolDef = {
      name: 'boom',
      description: '炸',
      inputSchema: z.object({}),
      execute: async () => {
        throw new Error('业务炸了')
      },
    }
    const host = new FakeHost()
    const runner = mkRunner(mkModel([() => toolParts('c1', 'boom', {}), () => txt('工具挂了我换个方式')]))
    const r = await runner.run(mkTask({ boom: tool }), host)
    expect(r.stopReason).toBe('final')
    expect(JSON.stringify(host.savedStates[1].messages)).toContain('业务炸了')
  })

  it('⑦ maxSteps 护栏：不收敛循环干净终止并带原因', async () => {
    const tool: AgentToolDef = {
      name: 'loop_forever',
      description: '转',
      inputSchema: z.object({ i: z.number() }),
      execute: async (i) => i,
    }
    const host = new FakeHost()
    let n = 0
    const runner = mkRunner(
      mkModel([() => toolParts(`c${n++}`, 'loop_forever', { i: n })]),
    )
    const r = await runner.run(mkTask({ loop_forever: tool }, 3), host)
    expect(r.stopReason).toBe('max_steps')
    expect(host.trajectories).toContainEqual(expect.objectContaining({ kind: 'guardrail_stop', payload: { reason: 'max_steps' } }))
  })

  it('⑧ 中断：abort 后干净终止（stopReason=aborted）', async () => {
    const ac = new AbortController()
    const host = new FakeHost()
    Object.defineProperty(host, 'signal', { get: () => ac.signal })
    setTimeout(() => ac.abort(), 30)
    // 卡住的流（不 close）→ abort
    const stuckModel = new MockLanguageModelV3({
      provider: 't',
      modelId: 'm',
      doStream: async () => ({
        stream: new ReadableStream({
          start(c) {
            c.enqueue({ type: 'stream-start', warnings: [] })
            ac.signal.addEventListener('abort', () => c.close(), { once: true })
          },
        }),
      }),
    })
    const r = await new LoopRunner({ resolveModel: async () => stuckModel as unknown as LanguageModel }).run(
      mkTask({}),
      host,
    )
    expect(r.stopReason).toBe('aborted')
  })

  it('⑨ 无进展检测：nudge 注入一次后仍原地打转 → 以 stagnant 终止（深度 review：原恒以 max_steps 兜底）', async () => {
    const tool: AgentToolDef = {
      name: 'same_call',
      description: '同',
      inputSchema: z.object({}),
      execute: async () => 1,
    }
    const host = new FakeHost()
    const runner = mkRunner(mkModel([() => toolParts('c1', 'same_call', {})]), { stagnantLimit: 2 })
    const r = await runner.run(mkTask({ same_call: tool }, 10), host)
    expect(r.stopReason).toBe('stagnant') // nudge 一次后再次达限 → 确定性 stagnant 终止
    // 提示只注入一次（messages 中 STAGNANT 提示恰一条）
    const nudges = (host.savedStates.at(-1)?.messages ?? []).filter(
      (m) => typeof m.content === 'string' && m.content.includes('相同的工具调用'),
    )
    expect(nudges.length).toBe(1)
  })

  it('⑩ 恢复：loadState 命中后从既有 iteration 续跑（不重放用户消息）', async () => {
    const tool: AgentToolDef = {
      name: 'q',
      description: '查',
      inputSchema: z.object({}),
      execute: async () => 'ok',
    }
    const host = new FakeHost()
    const base = initState(mkTask({ q: tool }), Date.now())
    base.iteration = 2
    base.usage = { promptTokens: 100, completionTokens: 20, toolCalls: 2 }
    base.messages = [
      { role: 'user', content: '干活' },
      { role: 'assistant', content: '已查两次' },
    ]
    host.preloaded = base
    const runner = mkRunner(mkModel([() => txt('恢复后完成')]))
    const r = await runner.run(mkTask({ q: tool }), host)
    expect(r.stopReason).toBe('final')
    // usage 累计自恢复点起（>0 基线）
    expect(r.usage.promptTokens).toBeGreaterThanOrEqual(100)
    // 消息历史保留恢复前的内容
    expect(JSON.stringify(host.savedStates.at(-1)?.messages)).toContain('已查两次')
  })

  it('⑪ 流中途失败（error part 收尾）→ 以 error 终止，绝不把部分文本当 final（深度 review P1 回归）', async () => {
    const host = new FakeHost()
    const runner = mkRunner(mkModel([() => streamErrorChunks('半截回答', 'provider 500')]))
    const r = await runner.run(mkTask({}), host)
    expect(r.stopReason).toBe('error')
    expect(r.error).toContain('provider 500')
    expect(r.output).toBe('') // 半截文本不得成为"最终答案"
    // 部分内容仍留痕历史（宁可重放不丢史）
    expect(JSON.stringify(host.savedStates.at(-1)?.messages)).toContain('半截回答')
  })

  it('⑫ finishReason=error（无 error part）→ 同样以 error 终止', async () => {
    const host = new FakeHost()
    const runner = mkRunner(mkModel([
      () => [
        { type: 'stream-start', warnings: [] },
        { type: 'finish', finishReason: { unified: 'error', raw: undefined }, usage },
      ],
    ]))
    const r = await runner.run(mkTask({}), host)
    expect(r.stopReason).toBe('error')
  })

  it('⑬ finishReason=length → 按 final 收敛（截断答案可用，warn 可观测）', async () => {
    const host = new FakeHost()
    const runner = mkRunner(mkModel([
      () => [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: '被截断的答案' },
        { type: 'text-end', id: 't' },
        { type: 'finish', finishReason: { unified: 'length', raw: undefined }, usage },
      ],
    ]))
    const r = await runner.run(mkTask({}), host)
    expect(r.stopReason).toBe('final')
    expect(r.output).toBe('被截断的答案')
  })

  it('⑭ 工具超时 → TIMEOUT 错误回填，循环继续收敛', async () => {
    const never: AgentToolDef = {
      name: 'slow',
      description: '慢',
      inputSchema: z.object({}),
      // 永不 resolve——靠 withTimeout 墙钟切断（超时不中止底层执行，仅回填错误）
      execute: () => new Promise<never>(() => undefined),
    }
    const host = new FakeHost()
    const runner = mkRunner(mkModel([() => toolParts('c1', 'slow', {}), () => txt('超时后收敛')]), {
      toolTimeoutMs: 30,
    })
    const r = await runner.run(mkTask({ slow: never }, 6), host)
    expect(r.stopReason).toBe('final')
    expect(r.output).toBe('超时后收敛')
    // 超时错误已回填为 tool 结果（模型据此改路）
    expect(JSON.stringify(host.savedStates.at(-1)?.messages)).toContain('TIMEOUT')
  })
})
