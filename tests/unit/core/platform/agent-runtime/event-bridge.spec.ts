/**
 * EventBridge 单元测试（契约 = 23 号 §7/§7b + 21 号双路径决策）
 * 覆盖：通道分流/delta 合批与终态前冲刷/领域事件总线映射与 payload/
 * 总线失败降级（直推不断）/保序链/UI-only 不进总线/compaction phase 过滤。
 */

import { describe, it, expect, vi } from 'vitest'
import { EventBridge, type PlatformBusPort } from '@core/platform/agent-runtime/runtime/event-bridge'
import type { AgentEvent } from '@shared/types/agent.types'

interface Harness {
  direct: Array<{ channel: string; event: AgentEvent }>
  published: Array<{ type: string; aggregate: { kind: string; id: string }; payload: Record<string, unknown> }>
  publishImpl: PlatformBusPort['publish']
  bridge: EventBridge
}

function mkBridge(opts?: {
  bus?: PlatformBusPort | null
  deltaThrottleMs?: number
  publishOverride?: PlatformBusPort['publish']
}): Harness {
  const direct: Harness['direct'] = []
  const published: Harness['published'] = []
  const publishImpl =
    opts?.publishOverride ??
    (async (input) => {
      published.push(input as unknown as Harness['published'][number])
      return input
    })
  const bridge = new EventBridge({
    emitDirect: (channel, event) => direct.push({ channel, event }),
    definitionId: 'story-room',
    eventChannel: (scopeId) => `longwriting:agent:${scopeId}`,
    bus: opts?.bus ?? { publish: publishImpl },
    deltaThrottleMs: opts?.deltaThrottleMs,
  })
  return { direct, published, publishImpl, bridge }
}

const scope = 'p-1'

describe('通道分流与直推', () => {
  it('① 非 delta 事件走主通道（业务前缀）', () => {
    const { direct, bridge } = mkBridge()
    bridge.emit(scope, { type: 'stage', stage: 'deciding' })
    expect(direct).toHaveLength(1)
    expect(direct[0].channel).toBe(`longwriting:agent:${scope}`)
  })

  it('② reply:content 走 streamChannel（缺省 = 主通道——迁移期零改动承诺）', async () => {
    const { direct, bridge } = mkBridge({ deltaThrottleMs: 0 })
    bridge.emit(scope, { type: 'reply:content', summaryEventId: 'e1', delta: '你好' })
    await bridge.flush()
    const ch = direct.find((d) => d.event.type === 'reply:content')
    expect(ch?.channel).toBe(`longwriting:agent:${scope}`) // 旧前端只订阅业务主通道
  })

  it('③ delta 合批：窗口内两条合并为一条直推', async () => {
    vi.useFakeTimers()
    try {
      const { direct, bridge } = mkBridge({ deltaThrottleMs: 30 })
      bridge.emit(scope, { type: 'reply:content', summaryEventId: 'e1', delta: 'AB' })
      bridge.emit(scope, { type: 'reply:content', summaryEventId: 'e1', delta: 'CD' })
      expect(direct.filter((d) => d.event.type === 'reply:content')).toHaveLength(0) // 未到窗口
      vi.advanceTimersByTime(31)
      const merged = direct.filter((d) => d.event.type === 'reply:content')
      expect(merged).toHaveLength(1)
      expect(merged[0].event).toEqual({ type: 'reply:content', summaryEventId: 'e1', delta: 'ABCD' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('④ 终态事件前强制冲刷（delta 先于 reply:done 到达）', async () => {
    const { direct, bridge } = mkBridge({ deltaThrottleMs: 5000 })
    bridge.emit(scope, { type: 'reply:content', summaryEventId: 'e1', delta: 'X' })
    bridge.emit(scope, { type: 'reply:done', suggestions: ['继续'] })
    const types = direct.map((d) => d.event.type)
    expect(types.indexOf('reply:content')).toBeLessThan(types.indexOf('reply:done'))
    expect((direct.find((d) => d.event.type === 'reply:content')?.event as { delta: string }).delta).toBe('X')
  })

  it('⑤ 不同 summaryEventId 的 delta 互不混批', async () => {
    const { direct, bridge } = mkBridge({ deltaThrottleMs: 0 })
    bridge.emit(scope, { type: 'reply:content', summaryEventId: 'e1', delta: 'A' })
    bridge.emit(scope, { type: 'reply:content', summaryEventId: 'e2', delta: 'B' })
    await bridge.flush()
    const contents = direct.filter((d) => d.event.type === 'reply:content')
    expect(contents).toHaveLength(2)
  })
})

describe('领域事件 → 平台总线', () => {
  it('⑥ action:done 发布映射与 payload（aggregate=agent_session）', async () => {
    const { published, bridge } = mkBridge()
    bridge.emit(scope, { type: 'action:done', actionType: 'save_entity', status: 'ok', message: '已保存' })
    await bridge.flush()
    expect(published).toHaveLength(1)
    expect(published[0].type).toBe('agent:action.completed')
    expect(published[0].aggregate).toEqual({ kind: 'agent_session', id: 'story-room:p-1' })
    expect(published[0].payload).toMatchObject({ actionType: 'save_entity', status: 'ok' })
  })

  it('⑦ UI-only 事件不进总线：stage/action:start/reply:start/reply:content', async () => {
    const { published, bridge } = mkBridge({ deltaThrottleMs: 0 })
    bridge.emit(scope, { type: 'stage', stage: 'acting' })
    bridge.emit(scope, { type: 'action:start', actionType: 't', label: 'l' })
    bridge.emit(scope, { type: 'reply:start', summaryEventId: 'e1' })
    bridge.emit(scope, { type: 'reply:content', summaryEventId: 'e1', delta: 'x' })
    await bridge.flush()
    expect(published).toHaveLength(0)
  })

  it('⑧ compaction 仅 done 相位发布', async () => {
    const { published, bridge } = mkBridge()
    bridge.emit(scope, { type: 'compaction', phase: 'start' })
    bridge.emit(scope, { type: 'compaction', phase: 'summary' })
    bridge.emit(scope, { type: 'compaction', phase: 'done', tokensBefore: 100, tokensAfter: 40 })
    await bridge.flush()
    expect(published).toHaveLength(1)
    expect(published[0].type).toBe('agent:compaction.completed')
  })

  it('⑨ 保序：发布顺序与 emit 顺序一致（链串行化）', async () => {
    const { published, bridge } = mkBridge()
    const order: string[] = []
    const slowBus: PlatformBusPort = {
      publish: async (input) => {
        await new Promise((r) => setTimeout(r, input.type.includes('approval') ? 10 : 1))
        order.push(input.type)
        return input
      },
    }
    const h = mkBridge({ bus: slowBus })
    h.bridge.emit(scope, { type: 'error', error: 'a' })
    h.bridge.emit(scope, { type: 'approval:request', approvalId: 'x', toolName: 't', input: {}, card: { title: 'T', summary: '' }, expiresAt: 0 })
    h.bridge.emit(scope, { type: 'approval:resolved', approvalId: 'x', action: 'approve' })
    await h.bridge.flush()
    expect(order).toEqual(['agent:error', 'agent:approval.requested', 'agent:approval.resolved'])
    void order
    void bridge
    void published
  })

  it('⑩ 总线 publish 抛错：warn 不抛、直推已送达、链不断（后续仍发布）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      let fail = true
      const { direct, published, bridge } = mkBridge({
        publishOverride: async (input) => {
          if (fail) throw new Error('bus down')
          published.push(input as never)
          return input
        },
      })
      bridge.emit(scope, { type: 'error', error: 'x1' }) // 会失败
      expect(direct).toHaveLength(1) // 直推不受影响
      await bridge.flush()
      fail = false
      bridge.emit(scope, { type: 'error', error: 'x2' })
      await bridge.flush()
      expect(published).toHaveLength(1) // 链未断，恢复后成功
    } finally {
      warn.mockRestore()
    }
  })

  it('⑪ bus=null：仅直推，不炸', async () => {
    const { direct, bridge } = mkBridge({ bus: null })
    bridge.emit(scope, { type: 'reply:done' })
    await bridge.flush()
    expect(direct).toHaveLength(1)
  })

  it('⑫ 直推抛错：吞掉不扩散（事件推送不影响主流程）', () => {
    const bridge = new EventBridge({
      emitDirect: () => {
        throw new Error('ipc gone')
      },
      definitionId: 'd',
      eventChannel: (s) => `ch:${s}`,
      bus: null,
    })
    expect(() => bridge.emit(scope, { type: 'reply:done' })).not.toThrow()
  })
})


describe('租户捕获（2026-09-06 修复回归：timer 回调 ALS 丢失不再静默丢事件）', () => {
  it('⑬ delta 由 timer 冲刷时用缓冲时刻捕获的 userId 包裹 emitDirect', async () => {
    vi.useFakeTimers()
    try {
      const wrapped: string[] = []
      const direct: Array<{ channel: string; event: AgentEvent }> = []
      const bridge = new EventBridge({
        emitDirect: (channel, event) => direct.push({ channel, event }),
        getUserId: () => 'u-77',
        runWithUser: (uid, fn) => {
          wrapped.push(uid)
          fn()
        },
        definitionId: 'd',
        eventChannel: (sc) => `ch:${sc}`,
        bus: null,
        deltaThrottleMs: 30,
      })
      bridge.emit(scope, { type: 'reply:content', summaryEventId: 'e1', delta: 'X' })
      vi.advanceTimersByTime(31)
      expect(wrapped).toEqual(['u-77']) // 冲刷时按捕获租户包裹（Web 端无 uid 即丢）
      expect(direct).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('⑭ 总线发布信封携带显式 userId（异步链回调内 ALS 已丢）', async () => {
    const published: Array<{ userId?: string | null }> = []
    const bus = { publish: async (i: { userId?: string | null }) => (published.push(i), i) } as never
    const bridge = new EventBridge({
      emitDirect: () => undefined,
      getUserId: () => 'u-88',
      definitionId: 'd',
      eventChannel: (sc) => `ch:${sc}`,
      bus,
      deltaThrottleMs: 0,
    })
    bridge.emit(scope, { type: 'reply:done' })
    await bridge.flush()
    expect(published[0]?.userId).toBe('u-88')
  })
})
