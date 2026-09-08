/**
 * 系统 Agent 聊天宿主单测（28 号 M5 批4）
 * @module tests/unit/core/packs/chat/system-agent-service.spec
 *
 * runAgentChatTurn 全端口注入；模型经 MockLanguageModelV3 走真实 streamText；
 * 工具经真实 AgentToolRegistry 管线（fake 注册 discover_capabilities）。
 */

import { describe, it, expect } from 'vitest'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import type { LanguageModel } from 'ai'
import { z } from 'zod'
import type { StreamEvent, MessageMetadata } from '@shared/types'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import {
  runAgentChatTurn,
  buildSystemPrompt,
  digestAgentArgs,
  slimTrajectoryForBroadcast,
  agentSessionId,
  sanitizeSessionHistory,
  SYSTEM_AGENT_DEFINITION_ID,
} from '@core/packs/chat/services/system-agent/system-agent.service'
import type {
  AgentChatTurnDeps,
  AgentTurnMessagePort,
  AgentTurnSessionPort,
} from '@core/packs/chat/services/system-agent/system-agent.service'

// ==================== fake 构造 ====================

function txtModel(text: string, capture?: (prompt: unknown[]) => void): LanguageModel {
  return new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async (opts: { prompt?: unknown }) => {
      capture?.(structuredClone(opts.prompt ?? []))
      return { stream: simulateReadableStream({ chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: text },
        { type: 'text-end', id: 't' },
        { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, noCache: 5 }, totalTokens: { total: 15, noCache: 15 } } },
      ] }) }
    },
  }) as unknown as LanguageModel
}

function toolThenTextModel(toolName: string, input: unknown, finalText: string): LanguageModel {
  const steps: Array<() => Array<Record<string, unknown>>> = [
    () => [
      { type: 'stream-start', warnings: [] },
      { type: 'tool-call', toolCallId: 'tc-1', toolName, input: JSON.stringify(input) },
      { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, noCache: 5 }, totalTokens: { total: 15, noCache: 15 } } },
    ],
    () => [
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: finalText },
      { type: 'text-end', id: 't' },
      { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, noCache: 5 }, totalTokens: { total: 15, noCache: 15 } } },
    ],
  ]
  let i = 0
  return new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async () => ({ stream: simulateReadableStream({ chunks: steps[Math.min(i++, steps.length - 1)]() }) }),
  }) as unknown as LanguageModel
}

interface FakeMessageRow { id: string; content: string; metadata?: MessageMetadata }

function mkMessagesPort() {
  const rows: FakeMessageRow[] = []
  const port: AgentTurnMessagePort = {
    create: async (m) => {
      const row: FakeMessageRow = { id: `msg-${rows.length + 1}`, content: m.content, metadata: undefined }
      rows.push(row)
      return { id: row.id }
    },
    updateContent: async (id, content) => {
      const r = rows.find((x) => x.id === id)
      if (r) r.content = content
    },
    updateMetadata: async (id, metadata) => {
      const r = rows.find((x) => x.id === id)
      if (r) r.metadata = metadata
    },
    updateTokensUsed: async () => undefined,
  }
  return { port, rows }
}

function mkSessionsPort(history: Array<{ role: 'user' | 'assistant'; content: string }> = []) {
  const saved: Array<Array<{ role: string; content: string }>> = []
  const port: AgentTurnSessionPort = {
    load: async () => (history.length > 0 ? [...history] : undefined),
    save: async (_id, messages) => {
      saved.push(messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '[parts]' })))
    },
  }
  return { port, saved }
}

function mkRegistryWithCatalogTool(result: Record<string, unknown> = { workflows: [] }): { registry: AgentToolRegistry; calls: unknown[] } {
  const registry = new AgentToolRegistry()
  const calls: unknown[] = []
  const def: AgentToolDef<{ keyword?: string }> = {
    name: 'discover_capabilities',
    description: '目录（fake）',
    inputSchema: z.object({ keyword: z.string().optional() }),
    dangerLevel: 'read',
    execute: async (input) => {
      calls.push(input)
      return result
    },
  }
  registry.register(def, { source: 'builtin' })
  return { registry, calls }
}

function mkDeps(overrides: {
  model: LanguageModel
  registry: AgentToolRegistry
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  signal?: AbortSignal
}) {
  const messages = mkMessagesPort()
  const sessions = mkSessionsPort(overrides.history ?? [])
  const emitted: StreamEvent[] = []
  const deps: AgentChatTurnDeps = {
    messages: messages.port,
    sessions: sessions.port,
    trajectoryPort: null,
    registry: overrides.registry,
    resolveModel: async () => overrides.model,
    emit: (e) => emitted.push(e),
  }
  return { deps, messages, sessions, emitted }
}

function turn(deps: AgentChatTurnDeps, content: string, signal?: AbortSignal) {
  return runAgentChatTurn(deps, {
    dialogId: 'd1',
    content,
    systemPrompt: buildSystemPrompt(),
    modelPreference: { modelId: 'qwen-max' },
    signal: signal ?? new AbortController().signal,
    userMessageId: 'u1',
  })
}

// ==================== 纯函数 ====================

describe('系统 Agent 宿主（28 号 M5 批2）纯函数', () => {
  it('buildSystemPrompt：路由纪律在前，保留用户人设', () => {
    const base = buildSystemPrompt()
    expect(base).toContain('discover_capabilities')
    expect(buildSystemPrompt('你是鲁迅风格写手')).toContain('你是鲁迅风格写手')
    expect(buildSystemPrompt('你是鲁迅风格写手').startsWith(base.split('\n')[0])).toBe(true)
    expect(buildSystemPrompt('   ')).toBe(base)
  })

  it('digestAgentArgs：对象 JSON 化、超长截断、异常返回 undefined', () => {
    expect(digestAgentArgs({ a: 1 })).toBe('{"a":1}')
    const long = digestAgentArgs('x'.repeat(200), 10)
    expect(long).toContain('…')
    expect(digestAgentArgs(undefined)).toBeUndefined()
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic
    expect(digestAgentArgs(cyclic)).toBeUndefined()
  })

  it('slimTrajectoryForBroadcast：只收窄 payload.args，entry 本体字段必须保留（33 号实测 P1 回归）', () => {
    const call = {
      iteration: 2,
      kind: 'tool_call',
      name: 'web_search',
      payload: { toolCallId: 'c1', args: { query: 'x'.repeat(3000) } },
    }
    const slim = slimTrajectoryForBroadcast(call as never)
    // 旧实现错展开 payload 顶层——kind/name/iteration 全部丢失，时间线沦为无名孤儿卡
    expect(slim.kind).toBe('tool_call')
    expect(slim.name).toBe('web_search')
    expect(slim.iteration).toBe(2)
    const args = (slim.payload as { args?: unknown }).args
    expect(typeof args).toBe('string')
    expect(String(args).length).toBeLessThanOrEqual(2001)

    const result = { iteration: 2, kind: 'tool_result', name: 'web_search', payload: { toolCallId: 'c1', ok: false, error: 'X' } }
    expect(slimTrajectoryForBroadcast(result as never)).toBe(result) // 无 args 原样返回
    const bare = { iteration: 0, kind: 'decision', payload: null }
    expect(slimTrajectoryForBroadcast(bare as never)).toBe(bare)
  })

  it('agentSessionId：遵循 {definitionId}:{scopeId} 约定', () => {
    expect(agentSessionId('d1')).toBe(`${SYSTEM_AGENT_DEFINITION_ID}:dialog:d1`)
  })

  it('sanitizeSessionHistory：丢弃悬空 tool-call、保留完整配对、合并连续 user', () => {
    const history = [
      { role: 'user', content: '问题一' },
      // 悬空：tool-call 无对应 tool 消息（模型流失败残留）
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'tc-x', toolName: 'web_search', input: '{}' }] },
      // 完整：call + result 配对
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'tc-ok', toolName: 'web_search', input: '{}' }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'tc-ok', output: { ok: true } }] },
      { role: 'assistant', content: '回答一' },
      // 错误轮空历史形成的连续 user
      { role: 'user', content: '问题二' },
    ] as never as Parameters<typeof sanitizeSessionHistory>[0]
    const out = sanitizeSessionHistory(history)
    // 悬空 assistant 整条丢弃；其余保留
    expect(out).toHaveLength(5)
    expect(JSON.stringify(out)).not.toContain('tc-x')
    expect(JSON.stringify(out)).toContain('tc-ok')
    // 连续 user 合并（问题二与历史尾部的 assistant 不相邻——上一条是 assistant 回答一，
    // 所以这里合并的是仅当相邻时；本例最后两条是 assistant/user，不合并没有连续 user）
    expect(out.filter((m) => m.role === 'user')).toHaveLength(2)
    // 已配对历史原样保留
    const intact = sanitizeSessionHistory([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ] as never as Parameters<typeof sanitizeSessionHistory>[0])
    expect(intact).toHaveLength(2)
  })

  it('sanitizeSessionHistory：连续 user 合并为一条（Anthropic 严格交替护栏）', () => {
    const out = sanitizeSessionHistory([
      { role: 'user', content: '第一条' },
      { role: 'user', content: '第二条' },
    ] as never as Parameters<typeof sanitizeSessionHistory>[0])
    expect(out).toHaveLength(1)
    expect(out[0].role).toBe('user')
    expect(out[0].content).toContain('第一条')
    expect(out[0].content).toContain('第二条')
  })
})

// ==================== 轮次主体 ====================

describe('runAgentChatTurn', () => {
  it('首轮流式直答：文本落库、metadata.agent 为空、done 事件带 usage', async () => {
    const { registry } = mkRegistryWithCatalogTool()
    const { deps, messages, emitted } = mkDeps({ model: txtModel('你好，我是系统助手'), registry })
    const r = await turn(deps, '你好')
    expect(r.success).toBe(true)
    expect(r.stopReason).toBe('final')
    expect(messages.rows).toHaveLength(1) // AI 占位消息（用户消息由 service 层落库）
    const aiRow = messages.rows[0]
    expect(aiRow.content).toBe('你好，我是系统助手')
    expect(aiRow.metadata?.agent).toEqual({ toolCalls: [], refs: [] })
    expect(emitted.map((e) => e.type)).toEqual(['start', 'delta', 'done'])
    expect(emitted[2].usage?.totalTokens).toBe(15)
  })

  it('工具轮：fake 目录工具经 registry 管线执行，toolCalls/流事件成对', async () => {
    const { registry, calls } = mkRegistryWithCatalogTool({ workflows: [{ id: 'wf-1' }] })
    const { deps, messages, emitted } = mkDeps({ model: toolThenTextModel('discover_capabilities', { keyword: '简报' }, '找到了工作流 wf-1'), registry })
    const r = await turn(deps, '帮我看看有什么工作流')
    expect(r.success).toBe(true)
    expect(calls).toEqual([{ keyword: '简报' }])
    expect(r.toolCalls).toEqual([
      { name: 'discover_capabilities', ok: true, toolCallId: 'tc-1', argsDigest: '{"keyword":"简报"}' },
    ])
    expect(messages.rows[0].metadata?.agent?.toolCalls).toHaveLength(1)
    // 流事件：start → tool-start → tool-end(ok) → delta → done
    expect(emitted.map((e) => e.type)).toEqual(['start', 'tool-start', 'tool-end', 'delta', 'done'])
    expect((emitted[2] as { ok?: boolean }).ok).toBe(true)
    expect(emitted[1].dialogId).toBe('d1')
  })

  it('多轮续聊：既有历史 + 本轮用户消息进入 state（save 可见）', async () => {
    const { registry } = mkRegistryWithCatalogTool()
    const history = [
      { role: 'user' as const, content: '第一轮问题' },
      { role: 'assistant' as const, content: '第一轮回答' },
    ]
    const { deps, sessions } = mkDeps({ model: txtModel('第二轮回答'), registry, history })
    const r = await turn(deps, '第二轮问题')
    expect(r.success).toBe(true)
    // loadState 非空 → 跳过初始播种 save；仅 final 落一次
    expect(sessions.saved).toHaveLength(1)
    const last = sessions.saved[sessions.saved.length - 1]
    expect(last.some((m) => m.role === 'user' && m.content === '第二轮问题')).toBe(true)
    expect(last.some((m) => m.content === '第一轮回答')).toBe(true)
  })

  it('空目录 registry：明确报错而非静默裸聊', async () => {
    const { deps } = mkDeps({ model: txtModel('x'), registry: new AgentToolRegistry() })
    const r = await turn(deps, '你好')
    expect(r.success).toBe(false)
    expect(r.error).toContain('未注册')
  })

  it('模型流失败：无内容时 error 事件 + success:false', async () => {
    const { registry } = mkRegistryWithCatalogTool()
    const boom = new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doStream: async () => ({ stream: simulateReadableStream({ chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'error', error: new Error('provider 500') },
      ] }) }),
    }) as unknown as LanguageModel
    const { deps, emitted } = mkDeps({ model: boom, registry })
    const r = await turn(deps, '你好')
    expect(r.success).toBe(false)
    expect(emitted.filter((e) => e.type === 'error').length).toBe(1)
  })

  it('已中止信号：stop=aborted，done 事件带 interrupted', async () => {
    const { registry } = mkRegistryWithCatalogTool()
    const ctrl = new AbortController()
    ctrl.abort()
    const { deps, emitted } = mkDeps({ model: txtModel('不应出现'), registry, signal: ctrl.signal })
    const r = await turn(deps, '你好', ctrl.signal)
    expect(r.stopReason).toBe('aborted')
    expect(emitted[emitted.length - 1].interrupted).toBe(true)
  })

  it('悬空 tool-call 历史：loadState 清洗后再发模型与落盘（防 provider 400 死锁）', async () => {
    const { registry } = mkRegistryWithCatalogTool()
    const dirty = [
      { role: 'user', content: '第一轮' },
      // 模型流失败残留：tool-call 无 tool result
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'tc-x', toolName: 'web_search', input: '{}' }] },
    ]
    let promptSeen = ''
    const model = txtModel('好的', (prompt) => {
      promptSeen = JSON.stringify(prompt)
    })
    const { deps, sessions } = mkDeps({ model, registry, history: dirty })
    const r = await turn(deps, '第二轮')
    expect(r.success).toBe(true)
    // 发给模型的历史不含悬空 tool-call
    expect(promptSeen).not.toContain('tc-x')
    // 落盘的续聊历史同样干净（清洗发生在 load，save 持久化的是清洗后状态）
    const last = sessions.saved[sessions.saved.length - 1]
    expect(JSON.stringify(last)).not.toContain('tc-x')
    expect(last.some((m) => m.role === 'user' && m.content === '第二轮')).toBe(true)
  })

  it('失败轮有部分输出：内容附注失败原因且 metadata 落库（refs 不丢）', async () => {
    const { registry } = mkRegistryWithCatalogTool()
    const partialError = new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doStream: async () => ({ stream: simulateReadableStream({ chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: '部分输出' },
        { type: 'text-end', id: 't' },
        { type: 'error', error: new Error('provider 500') },
      ] }) }),
    }) as unknown as LanguageModel
    const { deps, messages } = mkDeps({ model: partialError, registry })
    const r = await turn(deps, '你好')
    expect(r.stopReason).toBe('error')
    expect(r.success).toBe(true) // 部分输出已作为消息交付（附失败注记）
    const aiRow = messages.rows[0]
    expect(aiRow.content).toContain('部分输出')
    expect(aiRow.content).toContain('provider 500')
    expect(aiRow.metadata?.agent).toBeDefined()
  })

  it('无进展护栏：同签名工具调用打转 → stagnant 终止，内容如实附注', async () => {
    const { registry } = mkRegistryWithCatalogTool()
    // 每步同签名工具调用（同工具+同参）→ 3 轮 stagnant → nudge 一次 → 再 3 轮 → stagnant 终止
    const alwaysTool = new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doStream: async () => ({ stream: simulateReadableStream({ chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'tool-call', toolCallId: 'tc-same', toolName: 'discover_capabilities', input: '{}' },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, noCache: 5 }, totalTokens: { total: 15, noCache: 15 } } },
      ] }) }),
    }) as unknown as LanguageModel
    const { deps, messages } = mkDeps({ model: alwaysTool, registry })
    const r = await turn(deps, '干活')
    expect(r.success).toBe(true)
    expect(r.stopReason).toBe('stagnant')
    const aiRow = messages.rows[0]
    expect(aiRow.content).toContain('护栏')
    expect(aiRow.content).toContain('stagnant')
    // nudge 前后各 ≥3 步执行且工具结果均有记录（精确护栏序列由 loop.spec 钉住）
    expect(aiRow.metadata?.agent?.toolCalls.length).toBeGreaterThanOrEqual(6)
  })
})
