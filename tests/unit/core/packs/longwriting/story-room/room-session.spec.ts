/**
 * 故事研讨室 v2.1 M2：会话引擎（主编宿主）单测
 * @module tests/unit/core/packs/longwriting/story-room/room-session.spec
 *
 * MockLanguageModelV3 直驱：doStream 驱动主编轮（零工具纯对话），
 * doGenerate 驱动轮后直调（静默账本提取/滚动摘要）。断言：零工具轮闭环、
 * 上下文组装（阶段/账本/已否决抑制/前情提要/原生历史）、滚动摘要触发、
 * 取消/互斥、提取容错与成功、账本状态机、事件序列。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import type { LanguageModel } from 'ai'
import { registerEventEmitter } from '@core/interfaces/event.interface'
import { registerAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import { StoryRoomSessionService } from '@core/packs/longwriting/story-room/room-session'
import { applyLedgerOp } from '@core/packs/longwriting/story-room/room-ledger'
import { editorSystemPrompt, buildEditorSnapshot } from '@core/packs/longwriting/story-room/room-session'
import { buildStrategySection, pickBuiltinBank } from '@core/packs/longwriting/story-room/room-phases'

// ==================== 事件捕获 ====================

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

// ==================== 模型构造 ====================

const USAGE = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, noCache: 5 }, totalTokens: { total: 15, noCache: 15 } }

function textStreamChunks(text: string): Array<Record<string, unknown>> {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: text },
    { type: 'text-end', id: 't' },
    { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: USAGE },
  ]
}

/**
 * 脚本化模型：doStream 弹 stream 队列（主编轮），doGenerate 弹 generates 队列
 * （轮后直调：账本提取/滚动摘要）。generate 不指定时默认 '[]'（无可提取）。
 */
function scriptedModel(streams: string[], generates: string[]): LanguageModel {
  const streamQueue = [...streams]
  const genQueue = [...generates]
  return new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: textStreamChunks(streamQueue.length > 0 ? streamQueue.shift()! : '主编回复') }),
    }),
    doGenerate: async () => ({
      content: [{ type: 'text', text: genQueue.length > 0 ? genQueue.shift()! : '[]' }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: USAGE,
      warnings: [],
    }),
  }) as unknown as LanguageModel
}

/** 永不完成的流（互斥/取消测试用） */
function hangingModel(): LanguageModel {
  return new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async (opts: { abortSignal?: AbortSignal }) => ({
      stream: new ReadableStream({
        start(ctrl) {
          ctrl.enqueue({ type: 'stream-start', warnings: [] })
          // 挂起但响应中断——provider 收到 abort 即 error（真实 provider 语义）
          opts.abortSignal?.addEventListener('abort', () => ctrl.error(new Error('请求已中断')), { once: true })
        },
      }),
    }),
  }) as unknown as LanguageModel
}

// ==================== 假 db / 装配 ====================

const ROOM_PRESET = {
  ledger: [
    { id: 'ce_1', kind: 'premise', title: '主角动机=洗冤复仇', points: ['被冤偷至宝'], status: 'confirmed', sourceTurn: 1, updatedAt: 1 },
    { id: 'ce_2', kind: 'taboo', title: '开局无敌', points: [], status: 'rejected', sourceTurn: 2, updatedAt: 2 },
  ],
  summary: '此前讨论了冤情引擎与复仇对象',
  summarizedTurn: 0,
  turnNo: 2,
  phase: 'story-core',
  contentTarget: 'novel',
  pendingCards: [],
  cardSeq: 0,
}

function makeFakeDb(roomState: Record<string, unknown> = ROOM_PRESET) {
  const projects = new Map<string, any>()
  projects.set('p1', {
    id: 'p1', name: '洗冤录', type: 'story', stage: 'overview', progress: 0,
    wizardState: { room: roomState },
  })
  const messages: Array<Record<string, unknown>> = []
  let seq = 0
  const db = {
    lwProjects: {
      getById: async (id: string) => projects.get(id) ?? null,
      update: async (id: string, patch: any) => {
        const p = projects.get(id)
        if (!p) return null
        if (patch.wizardState !== undefined) p.wizardState = patch.wizardState
        Object.assign(p, patch, { wizardState: p.wizardState })
        return p
      },
    },
    lwDesignMessages: {
      add: async (conversationId: string, msg: any) => {
        const row = { id: `dm_${++seq}`, conversationId, role: msg.role, content: msg.content, timestamp: msg.timestamp ?? Date.now(), metadata: msg.metadata ?? null }
        messages.push(row)
        return row
      },
      getByConversationId: async (conversationId: string) => messages.filter((m) => m.conversationId === conversationId),
    },
    lwStoryOverviews: { getByProjectId: async () => ({ id: 'ov1', title: '洗冤录', storyType: '玄幻', summary: '被冤逐出的弟子洗冤复仇' }) },
    lwCharacters: { getByProjectId: async () => [{ id: 'c1', name: '林晓', rolePosition: 'protagonist' }] },
    lwBackgrounds: { getByProjectId: async () => null },
    lwLocations: { getByProjectId: async () => [] },
    lwFactions: { getByProjectId: async () => [] },
    lwSkills: { getByProjectId: async () => [] },
    lwItems: { getByProjectId: async () => [] },
    lwPlots: { getByProjectId: async () => [] },
    lwOutlines: { getTreeByProjectId: async () => [] },
    _projects: projects,
    _messages: messages,
  }
  return db
}

function harness(model: LanguageModel, db: any, capturedTrajectory: Array<Record<string, unknown>>) {
  registerAgentLoopHarness({
    registry: new AgentToolRegistry(),
    resolveModel: async () => model,
    trajectoryRepo: {
      appendBatch: async (entries: Array<Record<string, unknown>>) => {
        capturedTrajectory.push(...entries)
      },
      maxSeq: async () => 0,
    } as never,
  })
  // 直建实例（不走单例——busy Map/构造 db 跨测试隔离）
  return new StoryRoomSessionService(db)
}

const CHANNEL = 'longwriting:room:p1'

beforeEach(() => {
  vi.clearAllMocks()
})

// ==================== 零工具轮闭环 ====================

describe('主编轮（零工具）', () => {
  it('纯对话闭环：文本落库 + delta/done 事件 + 轮次 metadata', async () => {
    const captured = installEventCapture()
    const traj: Array<Record<string, unknown>> = []
    const db = makeFakeDb()
    const svc = harness(scriptedModel(['好，"冤"比"废"引擎更强，先定冤情的源头。'], []), db, traj)

    const r = await svc.sendMessage('p1', '主角被冤偷了至宝')
    expect(r.stopReason).toBe('final')
    expect(r.assistantMessage.content).toContain('冤情')
    expect(r.assistantMessage.id).toBeTruthy()

    // 用户/主编消息都落库，metadata 带轮次与阶段
    const msgs = db._messages as Array<any>
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(JSON.parse(msgs[0].metadata!)).toEqual({ turnNo: 3, phase: 'story-core' })
    expect(JSON.parse(msgs[1].metadata!).turnNo).toBe(3)

    // 事件序列：delta → done（通道 longwriting:room:p1）
    const roomEvents = captured.filter((c) => c.channel === CHANNEL)
    const delta = roomEvents.find((e) => e.event.type === 'message:delta')
    const done = roomEvents.find((e) => e.event.type === 'message:done')
    expect((delta?.event as any).text).toContain('冤情')
    expect((done?.event as any).message.content).toContain('冤情')

    // 轮号推进
    const room = (db._projects.get('p1').wizardState as any).room
    expect(room.turnNo).toBe(3)
  })

  it('主编零工具：不产生工具调用轨迹（纯 chat 轮）', async () => {
    installEventCapture()
    const traj: Array<Record<string, unknown>> = []
    const svc = harness(scriptedModel(['回复'], []), makeFakeDb(), traj)
    await svc.sendMessage('p1', '继续讨论人物')
    const toolEntries = traj.filter((e) => e.kind === 'tool_call')
    expect(toolEntries).toHaveLength(0)
  })
})

// ==================== 上下文组装 ====================

describe('上下文组装（snapshot 注入）', () => {
  it('注入阶段/账本（含已否决抑制）/前情提要/圣经摘要', async () => {
    installEventCapture()
    const traj: Array<Record<string, unknown>> = []
    const svc = harness(scriptedModel(['回复'], []), makeFakeDb(), traj)

    await svc.sendMessage('p1', '我们继续')

    const turnStart = traj.find((e) => (e as any).name === 'turn_start') as any
    expect(turnStart).toBeTruthy()
    const text = String(turnStart.payload?.systemPrompt ?? JSON.stringify(turnStart.payload))
    expect(text).toContain('第 3 轮')
    expect(text).toContain('故事核')
    // 账本：confirmed 与 rejected 都注入，rejected 带「已否决」标记
    expect(text).toContain('主角动机=洗冤复仇')
    expect(text).toContain('已否决')
    expect(text).toContain('开局无敌')
    // 前情提要 + 圣经摘要
    expect(text).toContain('冤情引擎')
    expect(text).toContain('洗冤录')
  })

  it('原生历史注入（非文本重放：seeded 进原始流水）', async () => {
    installEventCapture()
    const rawRows: Array<unknown> = []
    const db = makeFakeDb()
    // 预置一轮历史
    ;(db._messages as any[]).push(
      { id: 'dm_h1', conversationId: 'room:p1', role: 'user', content: '上一轮我说要沉冤流', timestamp: 1, metadata: '{"turnNo":1,"phase":"story-core"}' },
      { id: 'dm_h2', conversationId: 'room:p1', role: 'assistant', content: '好，冤比废引擎更强', timestamp: 2, metadata: '{"turnNo":1,"phase":"story-core"}' },
    )
    registerAgentLoopHarness({
      registry: new AgentToolRegistry(),
      resolveModel: async () => scriptedModel(['回复'], []),
      trajectoryRepo: { appendBatch: async () => undefined, maxSeq: async () => 0 } as never,
    })
    const svc = new StoryRoomSessionService(db, {
      rawTranscript: { appendBatch: async (rows) => rawRows.push(...rows), maxSeq: async () => 0 },
    })
    await svc.sendMessage('p1', '继续')

    // seededHistory 经原始流水（rawTranscript）可观测
    const text = JSON.stringify(rawRows)
    expect(text).toContain('沉冤流')
    expect(text).toContain('冤比废引擎更强')
  })
})

// ==================== 静默共识提取 ====================

describe('静默账本提取（fail-soft）', () => {
  it('提取成功：账本更新 + ledger:update 事件', async () => {
    const captured = installEventCapture()
    const traj: Array<Record<string, unknown>> = []
    const db = makeFakeDb()
    const svc = harness(scriptedModel(['主编发言'], [
      '[{"op":"add","kind":"premise","title":"冤情源头是大师兄","points":["至宝失踪当夜他不在宗门"],"status":"tentative"}]',
    ]), db, traj)

    const r = await svc.sendMessage('p1', '我怀疑是大师兄干的')
    expect(r.ledgerUpdated).toBe(true)
    const room = (db._projects.get('p1').wizardState as any).room
    const added = room.ledger.find((e: any) => e.title === '冤情源头是大师兄')
    expect(added).toBeTruthy()
    expect(added.sourceTurn).toBe(3)
    expect(added.status).toBe('tentative')
    const update = captured.filter((c) => c.channel === CHANNEL).find((e) => e.event.type === 'ledger:update')
    expect(update).toBeTruthy()
  })

  it('提取输出坏 JSON：对话不受影响，账本不更新', async () => {
    const captured = installEventCapture()
    const traj: Array<Record<string, unknown>> = []
    const db = makeFakeDb()
    const before = JSON.stringify(ROOM_PRESET.ledger)
    const svc = harness(scriptedModel(['主编发言'], ['这不是JSON~~']), db, traj)

    const r = await svc.sendMessage('p1', '继续')
    expect(r.stopReason).toBe('final')
    expect(r.ledgerUpdated).toBe(false)
    expect(JSON.stringify((db._projects.get('p1').wizardState as any).room.ledger)).toBe(before)
    expect(captured.filter((c) => c.channel === CHANNEL).some((e) => e.event.type === 'ledger:update')).toBe(false)
  })
})

// ==================== 滚动摘要 ====================

describe('滚动摘要', () => {
  function summaryDb() {
    const room = { ...ROOM_PRESET, turnNo: 20, summarizedTurn: 0, summary: '' }
    const db = makeFakeDb(room)
    for (let t = 1; t <= 10; t++) {
      ;(db._messages as any[]).push(
        { id: `dm_u${t}`, conversationId: 'room:p1', role: 'user', content: `第${t}轮用户发言`, timestamp: t * 2, metadata: JSON.stringify({ turnNo: t, phase: 'story-core' }) },
        { id: `dm_a${t}`, conversationId: 'room:p1', role: 'assistant', content: `第${t}轮主编发言`, timestamp: t * 2 + 1, metadata: JSON.stringify({ turnNo: t, phase: 'story-core' }) },
      )
    }
    return db
  }

  it('未摘要轮数达阈值：压缩最老 BATCH 轮并推进水位', async () => {
    const db = summaryDb()
    const traj: Array<Record<string, unknown>> = []
    const svc = harness(scriptedModel(['主编发言'], [
      '[]', // 账本提取：无
      '讨论了开篇方向与金手指代价；定了沉冤流；否决了开局无敌',
    ]), db, traj)

    await svc.sendMessage('p1', '第21轮发言')
    const room = (db._projects.get('p1').wizardState as any).room
    expect(room.summarizedTurn).toBe(10)
    expect(room.summary).toContain('第 1~10 轮')
    expect(room.summary).toContain('沉冤流')
  })

  it('未达阈值：不触发摘要（generate 只被账本提取消费一次）', async () => {
    const db = makeFakeDb({ ...ROOM_PRESET, turnNo: 2, summarizedTurn: 0 })
    const genCalls: string[] = []
    const model = new MockLanguageModelV3({
      provider: 'test', modelId: 'mock',
      doStream: async () => ({ stream: simulateReadableStream({ chunks: textStreamChunks('回复') }) }),
      doGenerate: async () => {
        genCalls.push('call')
        return { content: [{ type: 'text', text: '[]' }], finishReason: { unified: 'stop', raw: undefined }, usage: USAGE, warnings: [] }
      },
    }) as unknown as LanguageModel
    const traj: Array<Record<string, unknown>> = []
    const svc = harness(model, db, traj)
    await svc.sendMessage('p1', '继续')
    expect(genCalls).toHaveLength(1) // 仅账本提取
  })
})

// ==================== 取消与互斥 ====================

describe('取消与互斥', () => {
  it('互斥：同项目上一轮未结束时报错', async () => {
    installEventCapture()
    const traj: Array<Record<string, unknown>> = []
    const db = makeFakeDb()
    const svc = harness(hangingModel(), db, traj)

    const first = svc.sendMessage('p1', '第一条')
    await new Promise((r) => setTimeout(r, 20))
    await expect(svc.sendMessage('p1', '第二条')).rejects.toThrow('主编还在回复')
    svc.cancel('p1')
    const r = await first
    expect(r.stopReason).toBe('aborted')
  })

  it('用户取消：stop=aborted → 兜底 assistant 落库 + done 事件', async () => {
    const captured = installEventCapture()
    const traj: Array<Record<string, unknown>> = []
    const db = makeFakeDb()
    const svc = harness(hangingModel(), db, traj)

    const p = svc.sendMessage('p1', '会长轮')
    await new Promise((r) => setTimeout(r, 20))
    svc.cancel('p1')
    const r = await p
    expect(r.stopReason).toBe('aborted')
    expect(r.assistantMessage.content).toContain('中断')
    const done = captured.filter((c) => c.channel === CHANNEL).find((e) => e.event.type === 'message:done')
    expect(done).toBeTruthy()
  })
})

// ==================== 账本状态机 / prompt 组装 ====================

describe('账本操作与 prompt 组装', () => {
  it('confirm/revise/discard 状态机', async () => {
    const db = makeFakeDb()
    let ledger = await applyLedgerOp(db, 'p1', { action: 'confirm', entryId: 'ce_1' })
    expect(ledger.find((e) => e.id === 'ce_1')!.status).toBe('confirmed')
    ledger = await applyLedgerOp(db, 'p1', { action: 'revise', entryId: 'ce_2', title: '开局不许无敌', points: ['前期靠智取'] })
    expect(ledger.find((e) => e.id === 'ce_2')!.title).toBe('开局不许无敌')
    ledger = await applyLedgerOp(db, 'p1', { action: 'discard', entryId: 'ce_2' })
    expect(ledger.find((e) => e.id === 'ce_2')).toBeUndefined()
    await expect(applyLedgerOp(db, 'p1', { action: 'confirm', entryId: 'nope' })).rejects.toThrow('不存在')
  })

  it('阶段策略按内容目标分叉（短剧=分集大纲）', () => {
    expect(buildStrategySection('outline', 'novel')).toContain('卷')
    expect(buildStrategySection('outline', 'script')).toContain('分集大纲')
    expect(editorSystemPrompt('story-core', 'novel', ['问题A'])).toContain('问题A')
    expect(pickBuiltinBank('玄幻题材')).toEqual(expect.arrayContaining([expect.stringContaining('金手指')]))
  })

  it('buildEditorSnapshot 拼接进度/账本/摘要段', () => {
    const snap = buildEditorSnapshot({ phase: 'characters', contentTarget: 'novel', turnNo: 5 }, '圣经摘要内容', '【共识账本】账本', '前情')
    expect(snap).toContain('第 5 轮')
    expect(snap).toContain('人物')
    expect(snap).toContain('圣经摘要内容')
    expect(snap).toContain('【共识账本】')
    expect(snap).toContain('前情')
  })
})
