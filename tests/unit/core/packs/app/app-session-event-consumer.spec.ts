/**
 * app-session 平台事件消费者单测（10-event-system §9 末行，M2 迁移）：
 * 命名持久消费者 'app-session-bridge'（startFrom='latest' 不补历史）+
 * §5.5 幂等约定——按 event.id 去重，at-least-once 补投不重复写会话卡片。
 *
 * 用假 EventBus 捕获订阅面与 handler（真实总线集成由 event-bus.spec / 冒烟覆盖）。
 */
import { describe, it, expect, vi } from 'vitest'

import { AppSessionService, APP_SESSION_EVENT_CONSUMER } from '@core/packs/app/services/app-session.service'
import { WORKFLOW_SESSION_CARDS } from '@shared/types/app.types'
import type { EventBus, EventHandler, PlatformEvent, SubscribeOptions, SubscriptionFilter } from '@shared/types/event.types'

// ---- 内存假仓库（对齐 app-session.spec 的形态） ----
class MemSessions {
  rows: Map<string, any> = new Map()
  seq = 0
  async create(i: any) {
    const id = i.id ?? `s${++this.seq}`
    const row = { id, userId: 'u1', status: 'idle', lastStartInputs: null, lastRunId: null, createdAt: new Date(), updatedAt: new Date(), ...i }
    this.rows.set(id, row)
    return { ...row }
  }
  async findById(id: string) { return this.rows.get(id) ?? null }
  async update(id: string, patch: any) {
    const row = this.rows.get(id)
    if (!row) return null
    Object.assign(row, patch, { updatedAt: new Date() })
    return { ...row }
  }
  async listByApp(appId: string) { return [...this.rows.values()].filter(r => r.appId === appId) }
  async listByStatus(status: string) { return [...this.rows.values()].filter(r => r.status === status) }
  async delete(id: string) { return this.rows.delete(id) ? 1 : 0 }
}
class MemAppSessionMessages {
  rows: any[] = []
  seq = 0
  async create(m: any) {
    const row = { id: `m${++this.seq}`, sessionId: m.sessionId, role: m.role, content: m.content, metadata: m.metadata ?? null, createdAt: new Date() }
    this.rows.push(row)
    return row
  }
  async getBySessionId(sessionId: string) {
    return this.rows.filter(r => r.sessionId === sessionId).map(r => ({ ...r, dialogId: r.sessionId }))
  }
  async deleteBySessionId(sessionId: string) {
    this.rows = this.rows.filter(r => r.sessionId !== sessionId)
    return 1
  }
}

// ---- 假 EventBus：捕获订阅参数与 handler ----
let captured: { filter: SubscriptionFilter; handler: EventHandler; opts?: SubscribeOptions } | null = null
let subscribeCalls = 0
const fakeBus = {
  subscribe(filter: SubscriptionFilter, handler: EventHandler, opts?: SubscribeOptions) {
    subscribeCalls++
    captured = { filter, handler, opts }
    return { id: `sub-${subscribeCalls}`, unsubscribe: vi.fn(async () => {}) }
  },
} as unknown as EventBus

const fakeEngine = { resumeReview: vi.fn(async () => true) }
const defs = { getById: vi.fn(async () => ({ id: 'd1', publishedGraph: { version: 1, nodes: [{ id: 'start', type: 'start', config: { inputs: [] } }], edges: [] } })) }

function makeService() {
  const sessions = new MemSessions()
  const appMsg = new MemAppSessionMessages()
  const apps = { rows: new Map<string, any>([['a1', { id: 'a1', sourceId: 'd1', channelSession: 1, enabled: 1 }]]) }
  const runService = {
    startRun: vi.fn(async () => ({ id: 'run_1', status: 'running' })),
    getRunDetail: vi.fn(async () => ({ run: { status: 'running' }, nodeRuns: [] })),
  }
  const svc = new AppSessionService(
    { appSessions: sessions as any, appSessionMessages: appMsg as any, runService: runService as any, engine: fakeEngine as any },
    { findById: async (id: string) => apps.rows.get(id) ?? null } as any,
    defs as any
  )
  return { sessions, appMsg, svc }
}

function platformEvent(over: Partial<PlatformEvent> & { id: string }): PlatformEvent {
  return {
    seq: 1,
    userId: 'u1',
    type: 'workflow.run.node-status',
    aggregate: { kind: 'workflow_run', id: 'run_1' },
    actor: { kind: 'workflow', id: null },
    payload: { runId: 'run_1', nodeId: 'n1', status: 'running' },
    causationId: null,
    correlationId: 'run_1',
    occurredAt: Date.now(),
    schemaVersion: 1,
    ...over,
  }
}

async function flushCards(): Promise<void> {
  for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 10))
}

describe('AppSessionService 平台事件消费者（M2）', () => {
  it('attachEventConsumer：命名消费者 + startFrom=latest + 订阅 workflow.run.*；重复挂接幂等', async () => {
    const { svc } = makeService()
    subscribeCalls = 0
    svc.attachEventConsumer(fakeBus)
    svc.attachEventConsumer(fakeBus) // 第二次不重复订阅
    expect(subscribeCalls).toBe(1)
    expect(captured!.opts).toEqual({ consumerName: APP_SESSION_EVENT_CONSUMER, startFrom: 'latest' })
    expect(captured!.opts!.consumerName).toBe('app-session-bridge')
    expect(captured!.filter.types).toEqual(['workflow.run.*'])
  })

  it('幂等键去重：同一 event.id 重复投递只写一张卡片（at-least-once 补投语义）', async () => {
    const { svc, appMsg } = makeService()
    svc.attachEventConsumer(fakeBus)
    const s = await svc.createSession('a1')
    await svc.startRun(s.id, {}) // 登记 runToSession: run_1 → session
    const before = appMsg.rows.length

    const e = platformEvent({ id: 'evt-dup-1' })
    await captured!.handler(e)
    await captured!.handler(e) // 补投/重投同一事件
    await flushCards()

    const nodeCards = appMsg.rows.slice(before).filter(
      r => r.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.nodeStatus
    )
    expect(nodeCards).toHaveLength(1) // 去重生效
  })

  it('不同 event.id 各写一张；未登记映射的扩展类型不写卡', async () => {
    const { svc, appMsg } = makeService()
    svc.attachEventConsumer(fakeBus)
    const s = await svc.createSession('a1')
    await svc.startRun(s.id, {})

    await captured!.handler(platformEvent({ id: 'evt-a', payload: { runId: 'run_1', nodeId: 'n1', status: 'running' } }))
    await captured!.handler(platformEvent({ id: 'evt-b', payload: { runId: 'run_1', nodeId: 'n1', status: 'succeeded' } }))
    await captured!.handler(platformEvent({ id: 'evt-c', type: 'workflow.run.future-ext' }))
    await flushCards()

    const nodeCards = appMsg.rows.filter(r => r.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.nodeStatus)
    expect(nodeCards).toHaveLength(2)
  })

  it('handler 同步抛错被隔离（不成毒消息进 DLQ）', async () => {
    const { svc } = makeService()
    svc.attachEventConsumer(fakeBus)
    // runId 未登记 → handleRunEvent 静默跳过；构造 payload 触发异常路径也不应抛出
    expect(() => captured!.handler(platformEvent({ id: 'evt-x', payload: null as never }))).not.toThrow()
  })
})
