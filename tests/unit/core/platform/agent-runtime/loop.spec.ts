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
import { LoopRunner, initState, normalizeDecision, truncateJson, buildSystem, buildTurnContext } from '@core/platform/agent-runtime/runtime/loop'
import type { AgentHost, AgentLoopState, AgentTask, AgentToolDef, TrajectoryEntry, AgentStreamEvent } from '@core/platform/agent-runtime/types'
import { isTurnContextMessage } from '@core/platform/agent-runtime/context/turn-context'

// ==================== 测试基建（公共件见 ./helpers——与 agent-service.spec 共用） ====================

import { mockUsage as usage, txtChunks as txt, toolCallChunks as toolParts, mkModel, streamErrorChunks } from './helpers'

class FakeHost implements AgentHost {
  savedStates: AgentLoopState[] = []
  /** 每次 saveState 收到的 meta.appended（39 号 P0-2 原始流水增量） */
  savedAppended: Array<ModelMessage[] | undefined> = []
  trajectories: TrajectoryEntry[] = []
  streams: AgentStreamEvent[] = []
  preloaded: AgentLoopState | null = null
  signal = new AbortController().signal
  async loadState() {
    return this.preloaded
  }
  async saveState(s: AgentLoopState, meta?: { appended?: ModelMessage[] }) {
    this.savedStates.push(JSON.parse(JSON.stringify(s)))
    this.savedAppended.push(meta?.appended ? JSON.parse(JSON.stringify(meta.appended)) : undefined)
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

  it('⑥b registry 包装工具 ok:false：error/detail/hint 进轨迹（33 号长程实测回归）', async () => {
    const tool: AgentToolDef = {
      name: 'draft_tool',
      description: '失败的内部分析',
      inputSchema: z.object({}),
      registryWrapped: true,
      execute: async () => ({ ok: false, error: 'LIMIT_EXCEEDED', detail: '模型输出不是合法 JSON', hint: '单次运行上限已用尽' }),
    }
    const host = new FakeHost()
    const runner = mkRunner(mkModel([() => toolParts('c1', 'draft_tool', {}), () => txt('明白，不再重试')]))
    const r = await runner.run(mkTask({ draft_tool: tool }), host)
    expect(r.stopReason).toBe('final')
    const tr = host.trajectories.filter((t) => t.kind === 'tool_result')
    expect(tr.length).toBe(1)
    // 修复前：ok:false 不带原因——草稿生成连败两轮只能靠模型转述排障
    expect(tr[0].payload).toMatchObject({ toolCallId: 'c1', ok: false, error: 'LIMIT_EXCEEDED', detail: '模型输出不是合法 JSON', hint: '单次运行上限已用尽' })
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

// ==================== 总收口 review 回归 ====================

describe('并行双审批工具（P2：终态事件必达）', () => {
  it('同一步两个需批准工具：第二卡断言 throw 不裸穿——两动作 tool-end/tool_result 终态齐备', async () => {
    const saveTool: AgentToolDef = {
      name: 'save_entity',
      description: '存',
      inputSchema: z.object({ name: z.string() }),
      execute: async () => ({ ok: true }),
      requiresApproval: true,
    }
    const host = new FakeHost()
    // 单步双 tool-call（ai@6 并行执行）：审批回调第一次 approve，第二次 throw
    //（模拟 ApprovalCoordinator 同 scope 单卡断言）
    let approvalCalls = 0
    const runner = mkRunner(
      mkModel([
        () => [
          { type: 'stream-start', warnings: [] },
          { type: 'tool-call', toolCallId: 'c1', toolName: 'save_entity', input: JSON.stringify({ name: 'a' }) },
          { type: 'tool-call', toolCallId: 'c2', toolName: 'save_entity', input: JSON.stringify({ name: 'b' }) },
          { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage },
        ],
        () => txt('两卡都处理完'),
      ]),
      {
        requestApproval: async () => {
          approvalCalls++
          if (approvalCalls === 1) return { action: 'approve' }
          throw new Error('ApprovalCoordinator: scope s1 已有挂起审批（同会话同时最多一张）')
        },
      },
    )
    const r = await runner.run(mkTask({ save_entity: saveTool }), host)
    expect(r.stopReason).toBe('final') // 不被断言消息击穿
    const toolEnds = host.streams.filter((e) => e.kind === 'tool-end')
    const toolResults = host.trajectories.filter((t) => t.kind === 'tool_result')
    expect(toolEnds.length).toBe(2) // 修复前：第二动作 tool-end 永不发出
    expect(toolResults.length).toBe(2) // 修复前：tool_result 缺行（审计配对断裂）
    expect(toolResults.some((t) => t.payload?.denied === true)).toBe(true)
  })
})

// ==================== 39 号 P0-1：稳定 system / 轮次上下文块 / 缓存断点 ====================

describe('39 号 P0-1：系统提示词分层与轮次上下文块', () => {
  it('buildSystem 只含 systemPrompt（快照出 system——前缀缓存前提）', () => {
    const task = mkTask({}, 6)
    expect(buildSystem(task)).toBe('你是测试 agent')
  })

  it('buildTurnContext 组装快照/dynamicContext；全空返回空串', () => {
    const state = initState(mkTask({}, 6), 1)
    const bareTask = { ...mkTask({}, 6), snapshot: undefined }
    expect(buildTurnContext(bareTask, state)).toBe('')
    const withCtx = buildTurnContext({ ...mkTask({}, 6), snapshot: '人物：林晓', dynamicContext: '记忆行' }, state)
    expect(withCtx).toContain('[当前项目状态快照（来自数据库，确证事实）]')
    expect(withCtx).toContain('人物：林晓')
    expect(withCtx).toContain('记忆行')
  })

  it('轮次上下文块注入消息尾一次，并随 saveState meta 上报（原始流水增量）', async () => {
    const host = new FakeHost()
    const runner = mkRunner(mkModel([() => txt('直接回答')]))
    await runner.run({ ...mkTask({}, 6), snapshot: '人物：林晓' }, host)
    // 块在位且唯一
    const blocks = host.savedStates[host.savedStates.length - 1].messages.filter(isTurnContextMessage)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].content).toContain('人物：林晓')
    // 块作为消息出现在某次 meta.appended 中（transcript 增量）
    const appendedFlatten = host.savedAppended.flatMap((a) => a ?? [])
    expect(appendedFlatten.some(isTurnContextMessage)).toBe(true)
  })

  it('system 出站不含快照；快照只出现在消息（缓存前缀稳定）', async () => {
    const host = new FakeHost()
    const captured: unknown[] = []
    const runner = mkRunner(mkModel([() => txt('答')], (prompt) => captured.push(JSON.stringify(prompt))))
    await runner.run({ ...mkTask({}, 6), snapshot: '人物：林晓' }, host)
    expect(captured).toHaveLength(1)
    const promptJson = String(captured[0])
    // prompt 里快照仅出现在消息段（块内），system 段只有人设
    expect(promptJson).toContain('人物：林晓')
  })

  it('缓存断点：出站末 part 携带 ephemeral cacheControl（providerOptions 透传至 doStream prompt）', async () => {
    const host = new FakeHost()
    const captured: Array<{ parts: Array<Record<string, unknown>> }> = []
    const model = mkModel([() => txt('答')], (prompt) => {
      const last = (prompt as Array<{ content?: Array<Record<string, unknown>> }>).at(-1)
      captured.push({ parts: last?.content ?? [] })
    })
    await new LoopRunner({ resolveModel: async () => model, promptCache: true }).run(mkTask({}, 6), host)
    const lastPart = captured[0].parts.at(-1) as { providerOptions?: Record<string, { cacheControl?: { type?: string } }> } | undefined
    expect(lastPart?.providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral')
  })

  it('promptCache=false 时不打断点', async () => {
    const host = new FakeHost()
    const captured: Array<{ parts: Array<Record<string, unknown>> }> = []
    const model = mkModel([() => txt('答')], (prompt) => {
      const last = (prompt as Array<{ content?: Array<Record<string, unknown>> }>).at(-1)
      captured.push({ parts: last?.content ?? [] })
    })
    await new LoopRunner({ resolveModel: async () => model, promptCache: false }).run(mkTask({}, 6), host)
    const lastPart = captured[0].parts.at(-1) as { providerOptions?: Record<string, unknown> } | undefined
    expect(lastPart?.providerOptions?.anthropic).toBeUndefined()
  })

  it('withPromptCacheBreakpoint 不改变持久化历史（saveState 的 messages 保持原生形态）', async () => {
    const host = new FakeHost()
    const runner = mkRunner(mkModel([() => txt('答')]))
    await runner.run(mkTask({}, 6), host)
    for (const st of host.savedStates) {
      for (const m of st.messages) {
        expect(JSON.stringify(m)).not.toContain('ephemeral')
      }
    }
  })
})

// ==================== 41 号：线上名兼容（pack 冒号名 → provider 函数名） ====================

describe('41 号：线上名兼容（provider 边界别名化）', () => {
  function colonTool(): AgentToolDef {
    return {
      name: 'pack:lw-agent:generate_overview',
      description: '包工具（冒号规范名）',
      inputSchema: z.object({}),
      dangerLevel: 'read',
      execute: async () => ({ ok: true, data: { overview: '第一章概览' } }),
    }
  }

  it('装配给 provider 的函数名无冒号（线上名）；模型按线上名回呼可执行', async () => {
    const host = new FakeHost()
    const { MockLanguageModelV3 } = await import('ai/test')
    const { simulateReadableStream } = await import('ai/test')
    let step = 0
    const toolNamesSeen: string[][] = []
    const model2 = new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doStream: async (opts: { prompt?: unknown; tools?: Array<{ name?: string }> }) => {
        toolNamesSeen.push((opts.tools ?? []).map((t) => t.name ?? ''))
        const chunks = step++ === 0
          ? toolParts('c1', 'pack_lw-agent_generate_overview', {})
          : txt('概览已生成')
        return { stream: simulateReadableStream({ chunks }) }
      },
    }) as unknown as LanguageModel
    const runner = new LoopRunner({ resolveModel: async () => model2 })
    const result = await runner.run(mkTask({ 'pack:lw-agent:generate_overview': colonTool() }, 4), host)
    expect(result.stopReason).toBe('final')
    // provider 函数名合法（无冒号）
    expect(toolNamesSeen[0]).toContain('pack_lw-agent_generate_overview')
    expect(toolNamesSeen[0].some((n) => n.includes(':'))).toBe(false)
    // 轨迹/流事件全程规范名（回呼线上名已还原）
    const toolCalls = host.trajectories.filter((t) => t.kind === 'tool_call')
    expect(toolCalls[0].name).toBe('pack:lw-agent:generate_overview')
    const starts = host.streams.filter((e) => e.kind === 'tool-start')
    expect((starts[0] as { toolName: string }).toolName).toBe('pack:lw-agent:generate_overview')
  })
})
