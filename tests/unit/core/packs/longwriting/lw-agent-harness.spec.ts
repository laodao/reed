/**
 * M6 长文写作 Agent 迁移单测（30 号 G1/G3 门禁）
 * @module tests/unit/core/packs/longwriting/lw-agent-harness.spec
 *
 * MockLanguageModelV3 驱动真实 LoopRunner；动作执行走真实 executeActions +
 * 假仓库/假生成服务。断言：动作落库、AgentActionSummary 契约形状（与旧协议
 * 等价——G3 golden）、依赖 skipped、每轮 3 次上限、历史注入、事件序列。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import type { LanguageModel } from 'ai'
import { registerEventEmitter } from '@core/interfaces/event.interface'
import { registerAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import { LwAgentHarnessService, isLwHarnessEnabled } from '@core/packs/longwriting/agent-harness/lw-agent-harness.service'

// ==================== 事件捕获（registerEventEmitter 测试替身） ====================

interface CapturedEvent {
  channel: string
  event: { type: string; [k: string]: unknown }
}

function installEventCapture(): CapturedEvent[] {
  const captured: CapturedEvent[] = []
  registerEventEmitter(() => ({
    emit: (channel: string, event: unknown) => {
      captured.push({ channel, event: event as { type: string } })
    },
    emitProgress: () => undefined,
    emitStatus: () => undefined,
  } as never))
  return captured
}

// ==================== 假仓库 / 假生成服务 ====================

function makeFakeDb() {
  const overviews: Array<Record<string, unknown>> = []
  const messages: Array<{ conversationId: string; role: string; content: string; timestamp: number; metadata?: string }> = []
  const calls = { overviewCreate: 0, overviewUpdate: 0 }
  const db = {
    lwDesignMessages: {
      add: async (conversationId: string, msg: { role: string; content: string; timestamp?: number; metadata?: string }) => {
        const row = { conversationId, role: msg.role, content: msg.content, timestamp: msg.timestamp ?? Date.now(), metadata: msg.metadata }
        messages.push(row)
        return row
      },
      getByConversationId: async (conversationId: string) => messages.filter((m) => m.conversationId === conversationId),
    },
    lwStoryOverviews: {
      getByProjectId: async () => (overviews.length > 0 ? overviews[0] : null),
      update: async () => {
        calls.overviewUpdate++
      },
      create: async (record: Record<string, unknown>) => {
        calls.overviewCreate++
        overviews.push(record)
        return record
      },
    },
    lwCharacters: { getByProjectId: async () => [], create: async () => undefined },
    lwBackgrounds: { getByProjectId: async () => null, create: async () => undefined, update: async () => undefined },
    lwLocations: { getByProjectId: async () => [], create: async () => undefined },
    lwFactions: { getByProjectId: async () => [], create: async () => undefined },
    lwSkills: { getByProjectId: async () => [], create: async () => undefined },
    lwItems: { getByProjectId: async () => [], create: async () => undefined },
    lwPlots: { getByProjectId: async () => [], batchCreate: async () => undefined, create: async () => undefined },
    lwOutlines: { getByProjectId: async () => null, getTreeByProjectId: async () => [], create: async () => undefined },
    lwChapters: { getByOutlineIds: async () => new Map(), getByOutlineId: async () => null, create: async () => undefined, updateContent: async () => undefined, createVersion: async () => undefined },
    lwGraphEdges: { deleteByEntity: async () => 0 },
    _overviews: overviews,
    _messages: messages,
    _calls: calls,
  }
  return db as unknown as any & { _overviews: typeof overviews; _messages: typeof messages; _calls: typeof calls }
}

function makeFakeAi() {
  return {
    generateStoryOverview: async () => ({
      success: true,
      data: { title: '修仙之路', storyType: '修仙', coreIdea: '凡人逆天', summary: '一个凡人踏上修仙之路。', coreConflict: '凡人与天道', estimatedChapters: 100 },
    }),
    cancelAllForProject: () => undefined,
  }
}

// ==================== 模型构造 ====================

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

// ==================== 服务装配 ====================

function harness(model: LanguageModel, db: any, ai?: unknown): LwAgentHarnessService {
  registerAgentLoopHarness({
    registry: new AgentToolRegistry(),
    resolveModel: async () => model,
    trajectoryRepo: {
      appendBatch: async () => undefined,
      maxSeq: async () => 0,
    },
  })
  return LwAgentHarnessService.getInstance(db, (ai ?? makeFakeAi()) as never)
}

const PROJECT = 'p1'

async function send(svc: LwAgentHarnessService, content: string) {
  return svc.sendMessage(PROJECT, content)
}

beforeEach(() => {
  // 每用例全新单例与事件捕获
  const SvcClass0 = LwAgentHarnessService as unknown as { instance: unknown }
  SvcClass0.instance = null
  installEventCapture()
})

// ==================== 用例 ====================

describe('LwAgentHarnessService（30 号 M6）', () => {
  it('G3 golden：generate_overview 动作等价——落库 + 富摘要 + assistant 消息 metadata', async () => {
    const db = makeFakeDb()
    installEventCapture()
    const svc = harness(toolThenTextModel('generate_overview', { input: '修仙题材，凡人流' }, '概要已生成，请查看。'), db)

    const r = await send(svc, '帮我生成故事概要，主题是修仙凡人流')

    // 动作执行：概要落库
    expect(db._calls.overviewCreate).toBe(1)
    // G3 golden：AgentActionSummary 契约形状与旧协议一致
    expect(r.actionSummaries).toHaveLength(1)
    const s = r.actionSummaries[0]
    expect(s.type).toBe('generate_overview')
    expect(s.status).toBe('ok')
    expect(typeof s.message).toBe('string')
    // assistant 消息落库（metadata 带 actions/suggestions——前端历史恢复依赖）
    const assistant = db._messages.filter((m) => m.role === 'assistant')
    expect(assistant).toHaveLength(1)
    const meta = JSON.parse(assistant[0].metadata || '{}')
    expect(meta.actions[0].type).toBe('generate_overview')
    expect(Array.isArray(meta.suggestions)).toBe(true)
    // stopReason / stop 语义
    expect(r.stopReason).toBe('final')
  })

  it('G1 事件序列：单工具轮的精确序列（stage/reply:start 每工具步重置）', async () => {
    const db = makeFakeDb()
    const captured = installEventCapture()
    const svc = harness(toolThenTextModel('generate_overview', { input: '题材' }, '完成。'), db)

    await send(svc, '生成概要')

    const types = captured.filter((c) => c.channel === `longwriting:agent:${PROJECT}`).map((c) => c.event.type)
    // 轮首（stage+reply:start）→ 步1 文本 → decision（stage+reply:start 重置——
    // decision 先于工具执行）→ 工具（action:start/done，executeActions 发）→
    // 步2 总结 delta → reply:done
    expect(types).toEqual([
      'stage', 'reply:start',
      'stage',
      'action:start', 'action:done',
      'stage', 'reply:start',
      'reply:done',
    ])
  })

  it('流式总结正文经 longwriting:generate:summaryEventId 的 content 事件流出（前端既有订阅点）', async () => {
    const db = makeFakeDb()
    const captured = installEventCapture()
    const svc = harness(toolThenTextModel('generate_overview', { input: '题材' }, '最终总结文本'), db)

    await send(svc, '生成概要')

    const contentEvents = captured.filter((c) => c.channel.startsWith('longwriting:generate:agent-summary-'))
    expect(contentEvents.length).toBeGreaterThan(0)
    expect(contentEvents[0].event.type).toBe('content')
    expect(contentEvents.map((c) => c.event.content as string).join('')).toContain('最终总结文本')
  })

  it('G1 依赖 skipped：空状态下 generate_outline 标 skipped 且不落库', async () => {
    const db = makeFakeDb()
    installEventCapture()
    const svc = harness(toolThenTextModel('generate_outline', { structureLevel: 3 }, '需要先生成故事概要。'), db)

    const r = await send(svc, '直接生成细纲')

    expect(r.actionSummaries[0].status).toBe('skipped')
    expect(r.actionSummaries[0].message).toContain('缺少')
    expect(r.stopReason).toBe('final')
  })

  it('G1 每轮 3 次上限：第 4 个动作调用被拦截为 skipped', async () => {
    const db = makeFakeDb()
    const captured = installEventCapture()
    void captured
    // 模型两步共 4 次 generate_overview（第 1 步 3 次 + 第 2 步 1 次 + 总结）：
    // 第 4 次应被每轮上限拦截为 skipped
    const chunks: Array<() => Array<Record<string, unknown>>> = [
      () => [
        { type: 'stream-start', warnings: [] },
        { type: 'tool-call', toolCallId: 'a', toolName: 'generate_overview', input: JSON.stringify({ input: '甲' }) },
        { type: 'tool-call', toolCallId: 'b', toolName: 'generate_overview', input: JSON.stringify({ input: '乙' }) },
        { type: 'tool-call', toolCallId: 'c', toolName: 'generate_overview', input: JSON.stringify({ input: '丙' }) },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, noCache: 5 }, totalTokens: { total: 15, noCache: 15 } } },
      ],
      () => [
        { type: 'stream-start', warnings: [] },
        { type: 'tool-call', toolCallId: 'd', toolName: 'generate_overview', input: JSON.stringify({ input: '丁' }) },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, noCache: 5 }, totalTokens: { total: 15, noCache: 15 } } },
      ],
      () => [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: '本轮动作完成' },
        { type: 'text-end', id: 't' },
        { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, noCache: 5 }, totalTokens: { total: 15, noCache: 15 } } },
      ],
    ]
    let i = 0
    const model = new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doStream: async () => ({ stream: simulateReadableStream({ chunks: chunks[Math.min(i++, chunks.length - 1)]() }) }),
    }) as unknown as LanguageModel
    const svc = harness(model, db)

    const r = await send(svc, '批量改四个角色')

    const skipped = r.actionSummaries.filter((s) => s.status === 'skipped')
    expect(skipped.length).toBe(1)
    expect(skipped[0].message).toContain('上限')
  })

  it('G1 多轮历史注入：第二次 sendMessage 的模型 prompt 携带上一轮问答', async () => {
    const db = makeFakeDb()
    installEventCapture()
    const model1 = toolThenTextModel('generate_overview', { input: '题材' }, '第一轮完成')
    // 第二轮的模型：捕获 prompt
    let secondPrompt: unknown[] | null = null
    const model2 = new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doStream: async (opts: { prompt?: unknown }) => {
        secondPrompt = structuredClone(opts.prompt ?? []) as unknown[]
        return { stream: simulateReadableStream({ chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: '第二轮回答' },
          { type: 'text-end', id: 't' },
          { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, noCache: 1 }, totalTokens: { total: 2, noCache: 2 } } },
        ] }) }
      },
    }) as unknown as LanguageModel

    registerAgentLoopHarness({
      registry: new AgentToolRegistry(),
      resolveModel: async () => model1,
      trajectoryRepo: { appendBatch: async () => undefined, maxSeq: async () => 0 },
    })
    const svc = LwAgentHarnessService.getInstance(db, makeFakeAi() as never)
    await send(svc, '第一轮：生成概要')

    // 换模型（同服务实例——直接改内部 ai 无效，重新装配第二服务，共享 db）
    const SvcClass = LwAgentHarnessService as unknown as { instance: unknown }
    SvcClass.instance = null
    const svc2 = harness(model2, db)
    await send(svc2, '第二轮：继续')

    const json = JSON.stringify(secondPrompt ?? [])
    expect(json).toContain('第一轮：生成概要')
    expect(json).toContain('第一轮完成')
    expect(json).toContain('第二轮：继续')
  })

  it('切换开关：LW_AGENT_HARNESS 缺省开、显式 0 关闭', () => {
    const prev = process.env.LW_AGENT_HARNESS
    delete process.env.LW_AGENT_HARNESS
    expect(isLwHarnessEnabled()).toBe(true)
    process.env.LW_AGENT_HARNESS = '0'
    expect(isLwHarnessEnabled()).toBe(false)
    if (prev === undefined) delete process.env.LW_AGENT_HARNESS
    else process.env.LW_AGENT_HARNESS = prev
  })

  it('互斥：同项目上一轮未结束时报错', async () => {
    const db = makeFakeDb()
    installEventCapture()
    // 挂起型轮次：假 ai 的生成 promise 由测试持有，release 前轮次不结束
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => { release = r })
    const slowAi = {
      generateStoryOverview: async () => {
        await gate
        return { success: true, data: { title: '慢概要' } }
      },
      cancelAllForProject: () => undefined,
    }
    const slowModel = new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doStream: async () => ({ stream: simulateReadableStream({ chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'tool-call', toolCallId: 'tc', toolName: 'generate_overview', input: JSON.stringify({ input: 'x' }) },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, noCache: 1 }, totalTokens: { total: 2, noCache: 2 } } },
      ] }) }),
    }) as unknown as LanguageModel
    const svc = harness(slowModel, db, slowAi as never)
    const p = send(svc, '慢任务')
    await new Promise((r) => setTimeout(r, 200))
    await expect(send(svc, '第二个任务')).rejects.toThrow('上一轮对话仍在处理中')
    release()
    await p.catch(() => undefined)
  })
})

describe('LwAgentHarnessService 取消/中断（30 号 review P0-1 补钉）', () => {
  beforeEach(() => {
    const SvcClass = LwAgentHarnessService as unknown as { instance: unknown }
    SvcClass.instance = null
  })

  it('用户取消：stop=aborted → error 事件 + assistant 兜底消息（非空）', async () => {
    const db = makeFakeDb()
    const captured = installEventCapture()
    let releaseGate: (() => void) | undefined
    const gate = new Promise<void>((r) => { releaseGate = r })
    const slowAi = {
      generateStoryOverview: async () => {
        await gate
        return { success: true, data: { title: '慢' } }
      },
      cancelAllForProject: () => undefined,
    }
    const model = new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doStream: async () => ({ stream: simulateReadableStream({ chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'tool-call', toolCallId: 'tc', toolName: 'generate_overview', input: JSON.stringify({ input: 'x' }) },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, noCache: 1 }, totalTokens: { total: 2, noCache: 2 } } },
      ] }) }),
    }) as unknown as LanguageModel
    const svc = harness(model, db, slowAi as never)

    const p = send(svc, '慢任务')
    await new Promise((r) => setTimeout(r, 250))
    svc.cancel(PROJECT)
    const r = await p
    void releaseGate

    expect(r.stopReason).toBe('aborted')
    // error 事件发出
    const errEvents = captured.filter((c) => c.channel === `longwriting:agent:${PROJECT}` && c.event.type === 'error')
    expect(errEvents.length).toBe(1)
    // assistant 兜底消息落库（非空、含中断标记）
    const assistant = db._messages.filter((m) => m.role === 'assistant')
    expect(assistant.length).toBe(1)
    expect(assistant[0].content).toContain('已中断')
    // reply:done 也发（旧协议语义：气泡必有终态）
    expect(captured.some((c) => c.channel === `longwriting:agent:${PROJECT}` && c.event.type === 'reply:done')).toBe(true)
  })

  it('流式内容=落库内容：多步轮的步间叙述也进 assistant 消息', async () => {
    const db = makeFakeDb()
    installEventCapture()
    const chunks: Array<() => Array<Record<string, unknown>>> = [
      () => [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: '第一步叙述' },
        { type: 'text-end', id: 't1' },
        { type: 'tool-call', toolCallId: 'tc', toolName: 'generate_overview', input: JSON.stringify({ input: '题材' }) },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, noCache: 1 }, totalTokens: { total: 2, noCache: 2 } } },
      ],
      () => [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't2' },
        { type: 'text-delta', id: 't2', delta: '最终总结' },
        { type: 'text-end', id: 't2' },
        { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, noCache: 1 }, totalTokens: { total: 2, noCache: 2 } } },
      ],
    ]
    let i = 0
    const model = new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doStream: async () => ({ stream: simulateReadableStream({ chunks: chunks[Math.min(i++, chunks.length - 1)]() }) }),
    }) as unknown as LanguageModel
    const svc = harness(model, db)

    const r = await send(svc, '生成概要')
    const assistant = db._messages.filter((m) => m.role === 'assistant')
    expect(assistant[0].content).toContain('第一步叙述')
    expect(assistant[0].content).toContain('最终总结')
    expect(r.stopReason).toBe('final')
  })
})
