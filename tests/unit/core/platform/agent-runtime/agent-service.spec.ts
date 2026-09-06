/**
 * AgentRuntime 门面单元测试（契约测试 = 23 号 §1 的执行定义）
 * @module platform/agent-runtime/__tests__/agent-service.spec
 *
 * LLM 经 resolveModel 注入 MockLanguageModelV3（真实 streamText 路径），
 * 会话走 InMemorySessionStore、审批走 InMemoryApprovalStore——零数据库。
 * 覆盖：注册/冲突/注销、happy path 事件序（stage→reply:start→content→done）、
 * 三种 busy 模式（reject/queue FIFO/interrupt）、cancel、审批全流程（approve/
 * reject/Amendment 复用/未知 id）、历史重放、resetSession、getHistory limit、
 * ALS 租户包裹、LRU 驻留驱逐（pin 条件）、孤儿审批恢复、错误路径终态事件、
 * health、单例生命周期。
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import type { LanguageModel } from 'ai'
import { z } from 'zod'
import { getCurrentUserId } from '@core/context/user-context'
import { runWithUserAsync } from '@core/context/user-context'
import {
  AgentRuntimeImpl,
  AgentBusyError,
  AgentDefinitionConflictError,
  AgentDefinitionNotFoundError,
  AgentRuntimeNotInitializedError,
  AgentSessionResetError,
  AgentScopeOwnerMismatchError,
  MAX_STEER_QUEUE,
  initAgentRuntime,
  getAgentRuntime,
  disposeAgentRuntime,
  type AgentRuntime,
  type AgentRuntimeDeps,
} from '@core/platform/agent-runtime/runtime/agent-service'
import { InMemorySessionStore, AgentMessageTooLargeError } from '@core/platform/agent-runtime/memory/session-store'
import {
  InMemoryApprovalStore,
  type ApprovalStore,
} from '@core/platform/agent-runtime/runtime/approval'
import type { AgentSessionStore } from '@core/platform/agent-runtime/memory/session-store'
import type { AgentDefinition, AgentToolDef } from '@core/platform/agent-runtime/types'
import type { AgentEvent, PendingApproval } from '@shared/types/agent.types'

// ==================== 测试基建（公共件见 ./helpers——与 loop.spec 共用） ====================

import { txtChunks as txt, toolCallChunks as toolParts, mkModel, mockUsage as usage } from './helpers' 

function mkTool(over: Partial<AgentToolDef> = {}): AgentToolDef {
  return {
    name: 'lookup',
    description: '查设定',
    inputSchema: z.object({ q: z.string() }),
    execute: async (input: { q: string }) => ({ found: true, q: input.q }),
    ...over,
  }
}

function mkDef(over: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: 'story-room',
    version: 1,
    systemPrompt: '你是写作助手',
    tools: { lookup: mkTool() },
    buildStateSnapshot: async () => '人物：林晓',
    loopMode: 'react',
    eventChannel: (scopeId: string) => `agent:story-room:${scopeId}`,
    buildSuggestions: () => ['继续写', '换一段'],
    ...over,
  }
}

interface Harness {
  rt: AgentRuntime
  events: AgentEvent[]
  emitDirect: ReturnType<typeof vi.fn>
  store: AgentSessionStore
  approvalStore: ApprovalStore
  unsub: () => void
}

function mkHarness(
  model: LanguageModel,
  depsOver: Partial<AgentRuntimeDeps> = {},
  opts: { subscribe?: boolean } = {},
): Harness {
  const store = new InMemorySessionStore()
  const approvalStore = new InMemoryApprovalStore()
  const events: AgentEvent[] = []
  const emitDirect = vi.fn()
  const rt = new AgentRuntimeImpl({
    resolveModel: async () => model,
    sessionStore: store,
    eventEmitter: { emit: emitDirect },
    eventBus: null,
    approvalStore,
    sweeperIntervalMs: 0,
    ...depsOver,
  })
  rt.registerDefinition(mkDef())
  const unsub = opts.subscribe === false ? () => undefined : rt.subscribe('story-room', 's1', (e) => events.push(e))
  return { rt, events, emitDirect, store, approvalStore, unsub }
}

describe('定义注册', () => {
  it('重复 id 抛冲突；listDefinitions 带工具数；注销后发送抛未注册', async () => {
    const h = mkHarness(mkModel([() => txt('ok')]))
    expect(() => h.rt.registerDefinition(mkDef())).toThrow(AgentDefinitionConflictError)
    expect(h.rt.listDefinitions()).toEqual([
      { id: 'story-room', version: 1, toolCount: 1, loopMode: 'react' },
    ])
    h.rt.unregisterDefinition('story-room')
    await expect(h.rt.sendMessage('story-room', 's1', 'hi')).rejects.toThrow(AgentDefinitionNotFoundError)
    expect(() => h.rt.subscribe('story-room', 's1', () => undefined)).toThrow(AgentDefinitionNotFoundError)
  })

  it('注销时在途轮终态仍走业务通道（review P2 回归：终态必达）', async () => {
    let release!: () => void
    const gate = new Promise<void>((res) => (release = res))
    const tool = mkTool({ execute: async () => { await gate; return {} } })
    const h = mkHarness(mkModel([() => toolParts('c1', 'lookup', { q: 'x' }), () => txt('完')]))
    h.rt.unregisterDefinition('story-room')
    h.rt.registerDefinition(
      mkDef({ tools: { lookup: tool }, eventChannel: (s) => `biz:ch:${s}` }),
    )
    const p = h.rt.sendMessage('story-room', 's1', 'go')
    await vi.waitFor(() => expect(h.rt.health().busyScopes.length).toBeGreaterThan(0))
    h.rt.unregisterDefinition('story-room') // 在途时注销（abort 当前轮）
    release()
    const r = await p
    expect(r.stopReason).toBe('aborted')
    // 订阅者与直推都收到终态，且通道是业务通道（非默认 agent: 前缀）
    expect(h.events.some((e) => e.type === 'reply:done')).toBe(true)
    await new Promise((res) => setTimeout(res, 50))
    const doneOnBiz = h.emitDirect.mock.calls.some(
      ([channel, ev]) => channel === 'biz:ch:s1' && (ev as AgentEvent).type === 'reply:done',
    )
    expect(doneOnBiz).toBe(true)
  })

  it('跨租户同 scope：属主不匹配 fail-fast（深度 review P0/P1：四方法越权路径全收口）', async () => {
    const h = mkHarness(mkModel([() => txt('ok')]), {}, { subscribe: false })
    await runWithUserAsync('user-a', async () => {
      await h.rt.sendMessage('story-room', 's1', '属主消息')
    })
    await runWithUserAsync('user-b', async () => {
      await expect(h.rt.sendMessage('story-room', 's1', '越权消息')).rejects.toThrow(AgentScopeOwnerMismatchError)
      expect(() => h.rt.subscribe('story-room', 's1', () => undefined)).toThrow(AgentScopeOwnerMismatchError)
      // cancel / resetSession / listPendingApprovals / getHistory（驻留条目存在时）
      expect(() => h.rt.cancel('story-room', 's1')).toThrow(AgentScopeOwnerMismatchError)
      await expect(h.rt.resetSession('story-room', 's1')).rejects.toThrow(AgentScopeOwnerMismatchError)
      expect(() => h.rt.listPendingApprovals('story-room', 's1')).toThrow(AgentScopeOwnerMismatchError)
      await expect(h.rt.getHistory('story-room', 's1')).rejects.toThrow(AgentScopeOwnerMismatchError)
    })
    // 匿名（无 ALS）同样拦截——不因 null 属主放行
    expect(() => h.rt.subscribe('story-room', 's1', () => undefined)).toThrow(AgentScopeOwnerMismatchError)
    // 属主自己不受影响
    await runWithUserAsync('user-a', async () => {
      expect((await h.rt.getHistory('story-room', 's1')).length).toBeGreaterThan(0)
      expect(h.rt.cancel('story-room', 's1')).toBe(false) // 无在途轮：false 而非抛错
    })
  })

  it('跨租户 decideApproval：B 不能批准 A 的审批卡（深度 review P0 回归）', async () => {
    const tool = mkTool({ requiresApproval: true })
    const h = mkHarness(mkModel([() => toolParts('c1', 'lookup', { q: 'x' }), () => txt('完成')]), {}, { subscribe: false })
    h.rt.unregisterDefinition('story-room')
    h.rt.registerDefinition(mkDef({ tools: { lookup: tool } }))
    const p = h.rt.sendMessage('story-room', 's1', '执行') // 属主为匿名（null）
    await vi.waitFor(() => expect(h.rt.health().pendingApprovals).toBe(1))
    const card = h.rt.listPendingApprovals('story-room', 's1')[0]
    // user-B 拦截
    await runWithUserAsync('user-b', async () => {
      expect(() => h.rt.decideApproval(card.approvalId, { action: 'approve' })).toThrow(AgentScopeOwnerMismatchError)
    })
    // 属主决定正常
    expect(h.rt.decideApproval(card.approvalId, { action: 'reject' })).toBe(true)
    const r = await p
    expect(r.actionSummaries[0].ok).toBe(false)
  })

  it('InMemory 存储租户隔离：B 的 getHistory 读不到 A 的会话（无驻留条目时）', async () => {
    const h = mkHarness(mkModel([() => txt('甲的历史')]), {}, { subscribe: false })
    await h.rt.sendMessage('story-room', 's9', 'hi') // owner = null（匿名）
    // 删除驻留条目路径：直接以登录用户读——条目存在（s9 在册，owner null）→ 拦截；
    // 换新 scope 验证存储层隔离：A 写入后 B 读（A/B 各自上下文）
    await runWithUserAsync('user-a', async () => {
      const store = h.store
      await store.save('story-room:s10', [{ role: 'user', content: 'A 的隐私' }])
    })
    await runWithUserAsync('user-b', async () => {
      expect(await h.store.load('story-room:s10')).toBeUndefined()
    })
    await runWithUserAsync('user-a', async () => {
      expect((await h.store.load('story-room:s10'))?.length).toBe(1)
    })
  })

  it('消息体量门：超限输入入口拒绝（不进 LLM/驻留）', async () => {
    const h = mkHarness(mkModel([() => txt('不应到达')]))
    const huge = 'x'.repeat(600 * 1024)
    await expect(h.rt.sendMessage('story-room', 's1', huge)).rejects.toThrow(AgentMessageTooLargeError)
    expect(h.rt.health().busyScopes).toEqual([]) // 未开轮
  })

  it('Amendment 缓存随 resetSession 销毁：同参数重新发卡', async () => {
    const tool = mkTool({ requiresApproval: true })
    const h = mkHarness(
      mkModel([
        () => toolParts('c1', 'lookup', { q: 'x' }),
        () => txt('一轮完成'),
        () => toolParts('c2', 'lookup', { q: 'x' }),
        () => txt('二轮完成'),
      ]),
      {},
      { subscribe: false },
    )
    h.rt.unregisterDefinition('story-room')
    h.rt.registerDefinition(mkDef({ tools: { lookup: tool } }))
    const p1 = h.rt.sendMessage('story-room', 's1', '一')
    await vi.waitFor(() => expect(h.rt.health().pendingApprovals).toBe(1))
    h.rt.decideApproval(h.rt.listPendingApprovals('story-room', 's1')[0].approvalId, {
      action: 'approve',
      scope: 'session',
    })
    await p1
    await h.rt.resetSession('story-room', 's1')
    // reset 后同参数再次调用 → 重新发卡（缓存已随条目销毁）
    const p2 = h.rt.sendMessage('story-room', 's1', '二')
    await vi.waitFor(() => expect(h.rt.health().pendingApprovals).toBe(1))
    h.rt.decideApproval(h.rt.listPendingApprovals('story-room', 's1')[0].approvalId, { action: 'reject' })
    const r2 = await p2
    expect(r2.actionSummaries[0].ok).toBe(false)
  })

  it('dispose 限时等待在途轮：无僵尸补偿写覆盖新实例历史（深度 review P2-5 回归）', async () => {
    let release!: () => void
    const gate = new Promise<void>((res) => (release = res))
    const tool = mkTool({ execute: async () => { await gate; return {} } })
    const store = new InMemorySessionStore()
    const rt = new AgentRuntimeImpl({
      resolveModel: async () => mkModel([() => toolParts('c1', 'lookup', { q: 'x' }), () => txt('完')]),
      sessionStore: store,
      eventEmitter: { emit: () => undefined },
      sweeperIntervalMs: 0,
    })
    rt.registerDefinition(mkDef({ tools: { lookup: tool } }))
    const p1 = rt.sendMessage('story-room', 's1', '第一')
    await vi.waitFor(() => expect(rt.health().busyScopes.length).toBeGreaterThan(0))
    const disposed = rt.dispose()
    release()
    await disposed // abort + 等待在途轮 settle（含其补偿 saveState）
    await p1.catch(() => undefined)
    const before = await store.load('story-room:s1')
    // 等待一个宏任务窗口：无后续僵尸写
    await new Promise((res) => setTimeout(res, 30))
    expect(await store.load('story-room:s1')).toEqual(before)
  })
})

describe('sendMessage 主路径', () => {
  it('happy path：结果/事件序（stage→reply:start→content→done）/历史落盘', async () => {
    const h = mkHarness(mkModel([() => txt('答复正文')]))
    const r = await h.rt.sendMessage('story-room', 's1', '写一段')
    expect(r.reply).toBe('答复正文')
    expect(r.conversationId).toBe('story-room:s1')
    expect(r.stopReason).toBe('final')
    expect(r.suggestions).toEqual(['继续写', '换一段'])
    expect(r.usage.totalTokens).toBe(15)

    // 事件序（订阅者路径，同步直见）：deciding → reply:start → content → done
    const types = h.events.map((e) => e.type)
    expect(types.indexOf('stage')).toBeLessThan(types.indexOf('reply:start'))
    expect(types.indexOf('reply:start')).toBeLessThan(types.indexOf('reply:content'))
    expect(types.indexOf('reply:content')).toBeLessThan(types.indexOf('reply:done'))
    expect(types).not.toContain('error')

    // 直推通道（桥 delta 合批 30ms 后冲刷）
    await new Promise((res) => setTimeout(res, 60))
    expect(h.emitDirect).toHaveBeenCalled()
    const channels = h.emitDirect.mock.calls.map((c) => c[0] as string)
    expect(channels.every((c) => c === 'agent:story-room:s1')).toBe(true)

    // 历史落盘（user + assistant 正文）
    const history = await h.rt.getHistory('story-room', 's1')
    expect(history.map((m) => [m.role, m.content])).toEqual([
      ['user', '写一段'],
      ['assistant', '答复正文'],
    ])
  })

  it('工具轮：action:start/done 事件 + actionSummaries 配对（params/ok）', async () => {
    const h = mkHarness(
      mkModel([() => toolParts('c1', 'lookup', { q: '主角' }), () => txt('查到了')]),
    )
    const r = await h.rt.sendMessage('story-room', 's1', '查主角')
    expect(r.actionSummaries).toEqual([
      { type: 'lookup', params: { q: '主角' }, ok: true, brief: 'lookup' },
    ])
    const types = h.events.map((e) => e.type)
    expect(types).toContain('action:start')
    expect(types).toContain('action:done')
  })

  it('历史重放：第二轮模型入参包含首轮 user/assistant 消息', async () => {
    const seen: unknown[][] = []
    const h = mkHarness(
      mkModel([() => txt('第一轮'), () => txt('第二轮')], (prompt) => seen.push(prompt)),
    )
    await h.rt.sendMessage('story-room', 's1', '问题一')
    await h.rt.sendMessage('story-room', 's1', '问题二')
    expect(seen.length).toBeGreaterThanOrEqual(2)
    const second = JSON.stringify(seen[1])
    expect(second).toContain('问题一')
    expect(second).toContain('第一轮')
    expect(second).toContain('问题二')
  })

  it('onTurnEnd 钩子收到回复与工具调用', async () => {
    const onTurnEnd = vi.fn(async () => undefined)
    const h = mkHarness(mkModel([() => txt('好')] ))
    h.rt.unregisterDefinition('story-room')
    h.rt.registerDefinition(mkDef({ onTurnEnd }))
    await h.rt.sendMessage('story-room', 's1', 'hi')
    await vi.waitFor(() => expect(onTurnEnd).toHaveBeenCalled())
    expect(onTurnEnd.mock.calls[0][0].reply).toBe('好')
  })

  it('provider 解析失败：抛错 + error 终态事件 + 会话可继续复用', async () => {
    let fail = true
    const h = mkHarness(mkModel([() => txt('不该到达')]), {
      resolveModel: async () => {
        if (fail) throw new Error('provider 未配置')
        return mkModel([() => txt('恢复')])
      },
    })
    await expect(h.rt.sendMessage('story-room', 's1', 'hi')).rejects.toThrow('provider 未配置')
    expect(h.events.at(-1)).toMatchObject({ type: 'error', error: 'provider 未配置' })
    expect(h.rt.health().busyScopes).toEqual([])
    fail = false
    const r2 = await h.rt.sendMessage('story-room', 's1', '再来')
    expect(r2.reply).toBe('恢复')
  })
})

describe('互斥与 busy 模式', () => {
  function gatedHarness() {
    let release!: () => void
    const gate = new Promise<void>((res) => (release = res))
    const tool = mkTool({ execute: async () => { await gate; return { done: true } } })
    const model = mkModel([() => toolParts('c1', 'lookup', { q: 'x' }), () => txt('完工')])
    const h = mkHarness(model)
    h.rt.unregisterDefinition('story-room')
    h.rt.registerDefinition(mkDef({ tools: { lookup: tool } }))
    return { h, release }
  }

  it('缺省 reject：并发发送抛 AgentBusyError；当前轮不受影响', async () => {
    const { h, release } = gatedHarness()
    const p1 = h.rt.sendMessage('story-room', 's1', '第一')
    await vi.waitFor(() => expect(h.rt.health().busyScopes).toEqual(['story-room:s1']))
    await expect(h.rt.sendMessage('story-room', 's1', '第二')).rejects.toThrow(AgentBusyError)
    release()
    expect((await p1).reply).toBe('完工')
  })

  it('queue：排队至轮边界 FIFO 合流，两次排队都拿到各自结果', async () => {
    const { h, release } = gatedHarness()
    const p1 = h.rt.sendMessage('story-room', 's1', '第一')
    await vi.waitFor(() => expect(h.rt.health().busyScopes.length).toBeGreaterThan(0))
    const p2 = h.rt.sendMessage('story-room', 's1', '第二', { mode: 'queue' })
    const p3 = h.rt.sendMessage('story-room', 's1', '第三', { mode: 'queue' })
    release()
    expect((await p1).reply).toBe('完工')
    // 排队轮依次执行（各自一轮；模型 steps 循环最后一个）
    const r2 = await p2
    const r3 = await p3
    expect(r2.conversationId).toBe('story-room:s1')
    expect(r3.reply).toBe('完工')
    // 历史三轮 user 消息齐全
    const history = await h.rt.getHistory('story-room', 's1')
    expect(history.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['第一', '第二', '第三'])
  })

  it('interrupt：先取消当前轮再发送，旧轮 stopReason=aborted', async () => {
    const { h, release } = gatedHarness()
    const p1 = h.rt.sendMessage('story-room', 's1', '第一').catch((e) => e)
    await vi.waitFor(() => expect(h.rt.health().busyScopes.length).toBeGreaterThan(0))
    const p2 = h.rt.sendMessage('story-room', 's1', '打断', { mode: 'interrupt' })
    const r1 = await p1
    expect(r1.stopReason).toBe('aborted')
    release()
    expect((await p2).reply).toBe('完工')
  })

  it('cancel：工具执行中中断为 aborted；空转 cancel 返回 false', async () => {
    const { h, release } = gatedHarness()
    const p1 = h.rt.sendMessage('story-room', 's1', '第一')
    await vi.waitFor(() => expect(h.rt.health().busyScopes.length).toBeGreaterThan(0))
    expect(h.rt.cancel('story-room', 's1')).toBe(true)
    const r1 = await p1
    expect(r1.stopReason).toBe('aborted')
    expect(h.rt.cancel('story-room', 's1')).toBe(false)
    release() // 释放门（防悬挂 promise）
  })

  it('并发 interrupt 不双跑（review P1 回归）：工具执行从不重叠，全部消息都有终态', async () => {
    let active = 0
    let maxActive = 0
    let release!: () => void
    const gate = new Promise<void>((res) => (release = res))
    const tool = mkTool({
      execute: async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await gate
        active--
        return { done: true }
      },
    })
    const h = mkHarness(mkModel([() => toolParts('c1', 'lookup', { q: 'x' }), () => txt('完')]))
    h.rt.unregisterDefinition('story-room')
    h.rt.registerDefinition(mkDef({ tools: { lookup: tool } }))

    const p1 = h.rt.sendMessage('story-room', 's1', '第一')
    await vi.waitFor(() => expect(h.rt.health().busyScopes.length).toBeGreaterThan(0))
    // 双"打断重发"并发到达（旧实现恢复后无条件开轮 → 双轮并发）
    const pi1 = h.rt.sendMessage('story-room', 's1', '打断1', { mode: 'interrupt' })
    const pi2 = h.rt.sendMessage('story-room', 's1', '打断2', { mode: 'interrupt' })
    release()
    const results = await Promise.all([p1, pi1, pi2])
    expect(maxActive).toBe(1) // 互斥不变量：任意时刻同 scope 至多一轮
    expect(results.every((r) => typeof r.reply === 'string')).toBe(true)
  })

  it('interrupt 与 resetSession 交错（review P2 回归）：不复活已重置的旧历史', async () => {
    const { h, release } = gatedHarness()
    const p1 = h.rt.sendMessage('story-room', 's1', '旧消息内容')
    await vi.waitFor(() => expect(h.rt.health().busyScopes.length).toBeGreaterThan(0))
    const pi = h.rt.sendMessage('story-room', 's1', '打断后消息', { mode: 'interrupt' })
    await h.rt.resetSession('story-room', 's1')
    release()
    await p1 // aborted settle
    const ri = await pi // 重置后在干净会话上执行（语义：复位后到达的消息开新史）
    expect(ri.reply).toBe('完工')
    const history = await h.rt.getHistory('story-room', 's1')
    // 关键：旧轮内容（"旧消息内容"）不得复活；只有打断消息及其回复
    expect(history.map((m) => m.content)).toEqual(['打断后消息', '完工'])
  })

  it('queue 上限：超过 8 条排队 fail-fast 抛 AgentBusyError', async () => {
    const { h, release } = gatedHarness()
    const p1 = h.rt.sendMessage('story-room', 's1', '第一')
    await vi.waitFor(() => expect(h.rt.health().busyScopes.length).toBeGreaterThan(0))
    const queued: Array<Promise<unknown>> = []
    for (let i = 0; i < MAX_STEER_QUEUE; i++) {
      queued.push(h.rt.sendMessage('story-room', 's1', `排队${i}`, { mode: 'queue' }))
    }
    await expect(h.rt.sendMessage('story-room', 's1', '超限', { mode: 'queue' })).rejects.toThrow(AgentBusyError)
    release()
    await p1
    await Promise.all(queued) // 在队的全部照常完成
  })
})

describe('审批全流程', () => {
  function approvalHarness() {
    const tool = mkTool({
      requiresApproval: true,
      approvalCard: { title: '修改设定', summary: (i) => `将修改 ${JSON.stringify(i)}` },
    })
    const model = mkModel([
      () => toolParts('c1', 'lookup', { q: '主角' }),
      () => txt('批准后完成'),
    ])
    const h = mkHarness(model)
    h.rt.unregisterDefinition('story-room')
    h.rt.registerDefinition(mkDef({ tools: { lookup: tool } }))
    return h
  }

  it('approve：发卡 → listPending → decide → 工具执行 → 完成', async () => {
    const h = approvalHarness()
    const p = h.rt.sendMessage('story-room', 's1', '执行')
    await vi.waitFor(() => expect(h.rt.listPendingApprovals('story-room', 's1').length).toBe(1))

    const card = h.rt.listPendingApprovals('story-room', 's1')[0]
    expect(card.toolName).toBe('lookup')
    expect(card.cardTitle).toBe('修改设定')

    const requestEvent = h.events.find((e) => e.type === 'approval:request')
    expect(requestEvent).toMatchObject({ type: 'approval:request', toolName: 'lookup' })

    expect(h.rt.decideApproval(card.approvalId, { action: 'approve' })).toBe(true)
    const r = await p
    expect(r.reply).toBe('批准后完成')
    expect(r.actionSummaries[0].ok).toBe(true)
    expect(h.rt.listPendingApprovals('story-room', 's1')).toEqual([])
  })

  it('reject：工具拒绝回填，模型继续收敛', async () => {
    const h = approvalHarness()
    const p = h.rt.sendMessage('story-room', 's1', '执行')
    await vi.waitFor(() => expect(h.rt.listPendingApprovals('story-room', 's1').length).toBe(1))
    const card = h.rt.listPendingApprovals('story-room', 's1')[0]
    h.rt.decideApproval(card.approvalId, { action: 'reject', reason: '不要' })
    const r = await p
    expect(r.actionSummaries[0].ok).toBe(false)
    expect(h.events).toContainEqual(expect.objectContaining({ type: 'approval:resolved', action: 'reject' }))
  })

  it('Amendment：approve(scope=session) 后同类调用免发卡', async () => {
    // 四步模型：轮1 = tool-call + final；轮2 = 同参数 tool-call + final（确定性免卡验证）
    const h = mkHarness(
      mkModel([
        () => toolParts('c1', 'lookup', { q: '主角' }),
        () => txt('批准后完成'),
        () => toolParts('c2', 'lookup', { q: '主角' }),
        () => txt('免卡完成'),
      ]),
    )
    const tool = mkTool({ requiresApproval: true })
    h.rt.unregisterDefinition('story-room')
    h.rt.registerDefinition(mkDef({ tools: { lookup: tool } }))

    // 轮 1：发卡 → approve(scope=session) 沉淀
    const p1 = h.rt.sendMessage('story-room', 's1', '执行')
    await vi.waitFor(() => expect(h.rt.listPendingApprovals('story-room', 's1').length).toBe(1))
    h.rt.decideApproval(h.rt.listPendingApprovals('story-room', 's1')[0].approvalId, {
      action: 'approve',
      scope: 'session',
    })
    expect((await p1).reply).toBe('批准后完成')

    // 轮 2：同工具同参数 → 免卡直接执行
    const r2 = await h.rt.sendMessage('story-room', 's1', '再执行')
    expect(r2.reply).toBe('免卡完成')
    expect(r2.actionSummaries[0].ok).toBe(true) // 工具真实执行了
    expect(h.events.filter((e) => e.type === 'approval:request').length).toBe(1) // 全程仅一张卡
    expect(h.events).toContainEqual(expect.objectContaining({ action: 'session-amendment' }))
    expect(h.rt.listPendingApprovals('story-room', 's1')).toEqual([])
  })

  it('未知/过期 approvalId：decide 幂等返回 false', async () => {
    const h = approvalHarness()
    expect(h.rt.decideApproval('no-such', { action: 'approve' })).toBe(false)
    const p = h.rt.sendMessage('story-room', 's1', '执行')
    await vi.waitFor(() => expect(h.rt.listPendingApprovals('story-room', 's1').length).toBe(1))
    const id = h.rt.listPendingApprovals('story-room', 's1')[0].approvalId
    expect(h.rt.decideApproval(id, { action: 'approve' })).toBe(true)
    await p
    // 已决定过的卡再 decide → false（幂等）
    expect(h.rt.decideApproval(id, { action: 'reject' })).toBe(false)
  })

  it('审批挂起计入 health.pendingApprovals', async () => {
    const h = approvalHarness()
    const p = h.rt.sendMessage('story-room', 's1', '执行')
    await vi.waitFor(() => expect(h.rt.health().pendingApprovals).toBe(1))
    h.rt.decideApproval(h.rt.listPendingApprovals('story-room', 's1')[0].approvalId, { action: 'reject' })
    await p
    expect(h.rt.health().pendingApprovals).toBe(0)
  })
})

describe('会话管理', () => {
  it('resetSession：清历史、拒排队者、可重新开轮', async () => {
    let release!: () => void
    const gate = new Promise<void>((res) => (release = res))
    const tool = mkTool({ execute: async () => { await gate; return {} } })
    const h = mkHarness(mkModel([() => toolParts('c1', 'lookup', { q: 'x' }), () => txt('完')]))
    h.rt.unregisterDefinition('story-room')
    h.rt.registerDefinition(mkDef({ tools: { lookup: tool } }))

    const p1 = h.rt.sendMessage('story-room', 's1', '第一')
    await vi.waitFor(() => expect(h.rt.health().busyScopes.length).toBeGreaterThan(0))
    const p2 = h.rt.sendMessage('story-room', 's1', '第二', { mode: 'queue' })
    await h.rt.resetSession('story-room', 's1')
    release()
    await expect(p1).resolves.toBeDefined() // abort 后 settled
    await expect(p2).rejects.toThrow(AgentSessionResetError)
    expect(await h.rt.getHistory('story-room', 's1')).toEqual([])
    const r3 = await h.rt.sendMessage('story-room', 's1', '新开始')
    expect(r3.reply).toBe('完')
  })

  it('getHistory limit 取尾部；纯工具载体消息不进历史', async () => {
    const seen: unknown[][] = []
    const h = mkHarness(mkModel([() => txt('甲'), () => txt('乙')], (m) => seen.push(m)))
    await h.rt.sendMessage('story-room', 's1', '一')
    await h.rt.sendMessage('story-room', 's1', '二')
    const all = await h.rt.getHistory('story-room', 's1')
    expect(all.length).toBe(4) // 2 user + 2 assistant
    const tail = await h.rt.getHistory('story-room', 's1', 2)
    expect(tail.map((m) => m.content)).toEqual(['二', '乙'])
  })
})

describe('租户（ALS 红线）', () => {
  it('轮内落库与事件分发在入口捕获的租户上下文中执行', async () => {
    const saveUserIds: Array<string | null> = []
    const store: AgentSessionStore = {
      load: async (id) => (saveUserIds.push(getCurrentUserId()), id === 'story-room:s1' ? undefined : undefined),
      save: async (_id, msgs) => {
        saveUserIds.push(getCurrentUserId())
        void msgs
      },
      delete: async () => undefined,
    }
    const h = mkHarness(mkModel([() => txt('ok')]), { sessionStore: store }, { subscribe: false })
    await runWithUserAsync('user-77', async () => {
      await h.rt.sendMessage('story-room', 's1', 'hi')
    })
    // load/save 全部发生在 user-77 上下文内（runWithUserAsync 包裹生效）
    expect(saveUserIds.length).toBeGreaterThan(0)
    expect(saveUserIds.every((u) => u === 'user-77')).toBe(true)
  })
})

describe('上下文压缩集成（definition.contextWindowTokens 声明即启用）', () => {
  it('超水位轮内触发：compaction 事件链到达订阅者；用户消息守恒、摘要置尾', async () => {
    // 窗口 600 tok（软限 540）：工具结果 8000 字符 ≈ 2000 tok → 第二步前触发
    const def = mkDef({ contextWindowTokens: 600 })
    // 第一步：assistant 大段正文 + 工具调用（体量在 assistant——剪枝阶段不可折，
    // 迫使压缩进入摘要阶段；工具结果同样超线）
    const step1 = () => [
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: '析'.repeat(6_000) },
      { type: 'text-end', id: 't' },
      ...toolParts('c1', 'lookup', { q: 'x' }),
    ]
    const model = mkModel([
      step1 as () => Array<Record<string, unknown>>,
      () => txt('压缩后完成'),
    ]) as unknown as Record<string, unknown>
    // 摘要路径走 generateText（doGenerate）——mock 需补齐（mkModel 只配了 doStream）
    model.doGenerate = async () => ({
      content: [{ type: 'text', text: '目标：完成用户请求；已查询设定；当前继续作答。' }],
      finishReason: { unified: 'stop', raw: undefined },
      usage,
      warnings: [],
    })
    const h = mkHarness(model as never)
    h.rt.unregisterDefinition('story-room')
    h.rt.registerDefinition({
      ...def,
      tools: {
        lookup: mkTool({ execute: async () => ({ rows: 'y'.repeat(8_000) }) }),
      },
    })
    // 经事件观察：assemble 阶段的 compaction 事件应出现在订阅流
    const r = await h.rt.sendMessage('story-room', 's1', '会触发压缩的问题')
    expect(r.reply).toBe('压缩后完成')
    const compactionEvents = h.events.filter((e) => e.type === 'compaction')
    expect(compactionEvents.map((e) => (e as { phase: string }).phase)).toEqual(['start', 'summary', 'done'])
    // 守恒：历史中用户消息仍在、大工具结果被折叠（第二轮 save 后历史应含摘要前缀）
    const history = await h.rt.getHistory('story-room', 's1')
    expect(history.some((m) => m.role === 'user' && m.content.includes('会触发压缩的问题'))).toBe(true)
    expect(JSON.stringify(await h.store.load('story-room:s1'))).toContain('[Previous conversation summary]')
  })

  it('未声明 contextWindowTokens 的 definition：不压缩（纯 L3 直通）', async () => {
    const h = mkHarness(
      mkModel([() => toolParts('c1', 'lookup', { q: 'x' }), () => txt('完成')]),
    )
    h.rt.unregisterDefinition('story-room')
    h.rt.registerDefinition({
      ...mkDef(),
      tools: { lookup: mkTool({ execute: async () => ({ rows: 'y'.repeat(8_000) }) }) },
    })
    const r = await h.rt.sendMessage('story-room', 's1', 'q')
    expect(r.reply).toBe('完成')
    expect(h.events.filter((e) => e.type === 'compaction')).toEqual([])
  })
})

describe('会话驻留（LRU）', () => {
  it('容量驱逐只清无 pin 会话；有订阅者的幸存且订阅仍生效', async () => {
    const h = mkHarness(mkModel([() => txt('ok')]), { sessionCacheCapacity: 1 })
    await h.rt.sendMessage('story-room', 's1', 'hi')
    const eventsAfterFirst = h.events.length
    expect(h.rt.health().activeSessions).toBe(1) // s1（被订阅 pin）

    // 容量 1 下 s2 进入：s1 有订阅者不驱逐 → 容忍超容；轮结束仅做 TTL 驱逐（未到期不动）
    await h.rt.sendMessage('story-room', 's2', 'hi')
    expect(h.rt.health().activeSessions).toBe(2)

    // s1 幸存证据：其订阅者仍能收到 s1 新一轮事件（若条目被驱逐重建，旧订阅闭包收不到）
    await h.rt.sendMessage('story-room', 's1', 'again')
    await vi.waitFor(() => expect(h.events.length).toBeGreaterThan(eventsAfterFirst))

    // 退订后容量压力下无 pin 会话被驱逐（s1/s2 让位，最终只剩新会话）
    h.unsub()
    await h.rt.sendMessage('story-room', 's3', 'hi')
    expect(h.rt.health().activeSessions).toBe(1)
  })
})

describe('孤儿审批恢复（重启哨兵）', () => {
  it('构造时清理 store 残留挂起行', async () => {
    const store = new InMemoryApprovalStore()
    await store.save({
      approvalId: 'orphan-1',
      sessionId: 'story-room:s1',
      toolName: 'lookup',
      input: {},
      createdAt: 1,
      expiresAt: 2,
    } as PendingApproval)
    const h = mkHarness(mkModel([() => txt('ok')]), { approvalStore: store })
    await vi.waitFor(() => expect(store.listAll()).resolves.toEqual([]))
    expect(h.rt.health().pendingApprovals).toBe(0)
  })
})

describe('单例生命周期', () => {
  afterEach(async () => {
    await disposeAgentRuntime()
  })

  it('init 幂等返回同实例；dispose 后再 get 抛错', async () => {
    const rt1 = await initAgentRuntime({
      resolveModel: async () => mkModel([() => txt('x')]),
      sessionStore: new InMemorySessionStore(),
    })
    expect(getAgentRuntime()).toBe(rt1)
    const rt2 = await initAgentRuntime({
      resolveModel: async () => mkModel([() => txt('x')]),
      sessionStore: new InMemorySessionStore(),
    })
    expect(rt2).toBe(rt1) // 幂等
    await disposeAgentRuntime()
    expect(() => getAgentRuntime()).toThrow(AgentRuntimeNotInitializedError)
  })
})

// ==================== 总收口 review 回归 ====================

describe('resetSession 失败回滚（P1：曾永久毒化会话 + setImmediate 自旋）', () => {
  it('store.delete 抛错 → resetting 回滚 → 后续 sendMessage 可正常开轮', async () => {
    const flakyStore = new InMemorySessionStore()
    let failDelete = true
    const originalDelete = flakyStore.delete.bind(flakyStore)
    flakyStore.delete = async (key: string) => {
      if (failDelete) throw new Error('sqlite busy')
      return originalDelete(key)
    }
    const h = mkHarness(mkModel([() => txt('ok')]), { sessionStore: flakyStore }, { subscribe: false })
    await expect(h.rt.resetSession(mkDef().id, 's1')).rejects.toThrow('sqlite busy')
    // 修复前：resetting 永真 → queue 模式陷入 setImmediate 自旋；此处必须能正常开轮
    failDelete = false
    const r = await h.rt.sendMessage(mkDef().id, 's1', '重试成功', { mode: 'queue' })
    expect(r.reply).toBe('ok')
  })
})
