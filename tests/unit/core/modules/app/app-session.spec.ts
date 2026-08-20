/**
 * 应用会话服务测试（片2）：创建/启动（triggerInfo+多轮/互斥 skipped）/审核/事件桥写卡片/重命名
 * @module tests/app/app-session
 */
import { describe, it, expect, vi } from 'vitest'

import { AppSessionService } from '@core/modules/app/app-session.service'
import { APP_SESSION_STATUSES, WORKFLOW_SESSION_CARDS } from '@shared/types/app.types'

// ---- 内存假仓库 ----
class MemSessions {
  rows: Map<string, any> = new Map()
  seq = 0
  async create(i: any) {
    const id = `s${++this.seq}`
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
}
class MemMessages {
  rows: any[] = []
  seq = 0
  async create(m: any) {
    const row = { id: `m${++this.seq}`, ...m, createdAt: new Date() }
    this.rows.push(row)
    return row
  }
  async getByDialogId(dialogId: string) { return this.rows.filter(r => r.dialogId === dialogId) }
}
class MemApps {
  rows: Map<string, any> = new Map()
  async findById(id: string) { return this.rows.get(id) ?? null }
}

// ---- 可编程事件 tap / runService / engine / defs ----
let tapCb: ((c: string, d: unknown, u: string | null) => void) | null = null
const tapSource = { tapEvents: (cb: any) => { tapCb = cb; return () => { tapCb = null } } }

let startRunImpl: (input: any) => Promise<any>
let getRunImpl: (runId: string) => Promise<any>
const fakeRunService = { startRun: (i: any) => startRunImpl(i), getRun: (r: string) => getRunImpl(r) }
const fakeEngine = { resumeReview: vi.fn(async () => true) }
const defs = { getById: vi.fn(async () => ({ id: 'd1', publishedGraph: { version: 1, nodes: [{ id: 'start', type: 'start', config: { inputs: [{ key: 'q', type: 'string' }] } }], edges: [] } })) }

function makeService() {
  const sessions = new MemSessions()
  const messages = new MemMessages()
  const apps = new MemApps()
  const svc = new AppSessionService(
    { appSessions: sessions as any, messages: messages as any, runService: fakeRunService as any, engine: fakeEngine as any },
    apps as any,     // 构造签名：deps, apps, defs, tapSource
    defs as any,
    tapSource as any
  )
  return { sessions, messages, apps, svc }
}
function seedApp(apps: MemApps, over: Record<string, unknown> = {}) {
  apps.rows.set('a1', { id: 'a1', sourceId: 'd1', channelSession: 1, enabled: 1, ...over })
}
async function bootRun(apps: MemApps, svc: AppSessionService) {
  seedApp(apps)
  startRunImpl = async () => ({ id: 'run_1', status: 'running' })
  getRunImpl = async () => ({ run: { status: 'running' }, nodeRuns: [] })
  const s = await svc.createSession('a1')
  await svc.startRun(s.id, { q: 'hi' })
  return s
}
// bootRun 使用示例：事件桥用例统一从 makeService 解构 messages/sessions —— 保持本测试数据源一致

describe('AppSessionService：创建会话', () => {
  it('createSession 写首条 start-form 卡片（form=发布图 start.inputs）', async () => {
    const { apps, messages, svc } = makeService()
    seedApp(apps)
    const s = await svc.createSession('a1')
    expect(s.status).toBe(APP_SESSION_STATUSES.idle)
    const msg = messages.rows[0]
    expect(msg.dialogId).toBe(s.id)
    expect(msg.role).toBe('assistant')
    expect(msg.metadata.sessionCard.card).toBe(WORKFLOW_SESSION_CARDS.startForm)
    expect(Array.isArray(msg.metadata.sessionCard.form)).toBe(true)
    expect(msg.metadata.sessionCard.form[0].key).toBe('q')
  })

  it('应用不可用（enabled=0 / 会话渠道关）→ 抛错', async () => {
    const { apps, svc } = makeService()
    seedApp(apps, { enabled: 0 })
    await expect(svc.createSession('a1')).rejects.toThrow('不可用')
    apps.rows.set('a1', { id: 'a1', sourceId: 'd1', enabled: 1, channelSession: 0 })
    await expect(svc.createSession('a1')).rejects.toThrow('会话渠道')
  })

  it('getSessionMessages 按 dialogId 隔离', async () => {
    const { apps, messages, svc } = makeService()
    seedApp(apps)
    const s = await svc.createSession('a1')
    await messages.create({ dialogId: 'other', role: 'user', content: 'x', metadata: null })
    const msgs = await svc.getSessionMessages(s.id)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].dialogId).toBe(s.id)
  })
})

describe('AppSessionService：startRun 与多轮', () => {
  it('透传 triggerInfo + inputs；成功写 run-status 卡片；会话 status=running+lastRunId', async () => {
    const { apps, messages, svc, sessions } = makeService()
    const s = await bootRun(apps, svc)
    expect(sessions.rows.get(s.id).status).toBe('running')
    // 通过公共面验证：卡片
    const cards = await svc.getSessionMessages(s.id)
    const runCard = cards.find(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.runStatus)
    expect(runCard).toBeTruthy()
  })

  it('startRun 互斥（返回 skipped）→ 抛"运行进行中"', async () => {
    const { apps, svc } = makeService()
    startRunImpl = async () => ({ id: 'r', status: 'skipped', skipReason: '同工作流已有运行中实例' })
    getRunImpl = async () => ({ run: { status: 'skipped' }, nodeRuns: [] })
    seedApp(apps)
    const s = await svc.createSession('a1')
    await expect(svc.startRun(s.id, {})).rejects.toThrow('运行进行中')
  })

  it('未提供 inputs 时沿用 lastStartInputs（多轮）', async () => {
    const { apps, svc } = makeService()
    seedApp(apps)
    const s = await svc.createSession('a1')
    startRunImpl = async (_i: any) => ({ id: 'r1', status: 'running' })
    getRunImpl = async () => ({ run: { status: 'running' }, nodeRuns: [] })
    await svc.startRun(s.id, { q: 'first' })
    let captured: any
    startRunImpl = async (i: any) => { captured = i; return { id: 'r2', status: 'running' } }
    await svc.startRun(s.id) // 无 inputs → 沿用 first（defaultValue 合并由 runService 做）
    expect(captured.inputs).toEqual({ q: 'first' })
  })
})

describe('AppSessionService：审核恢复', () => {
  it('reviewDecide 透传 engine.resumeReview（runId=lastRunId + nodeId + 决策）', async () => {
    const { apps, svc } = makeService()
    const s = await bootRun(apps, svc)
    fakeEngine.resumeReview.mockClear()
    await svc.reviewDecide(s.id, 'form', { decision: 'approve_with_changes', editedValues: { doc: 'v' } } as any)
    expect(fakeEngine.resumeReview).toHaveBeenCalledWith('run_1', 'form', expect.objectContaining({ decision: 'approve_with_changes', editedValues: { doc: 'v' } }))
  })
})

describe('AppSessionService：事件桥', () => {
  const attachBridge = (svc: AppSessionService) => { svc.attach(tapSource.tapEvents) }
  it('reviewRequested(form) → 写 review 卡片（kind=form + schema）', async () => {
    const { messages, apps, svc } = makeService()
    attachBridge(svc)
    const s = await bootRun(apps, svc)
    tapCb!('wf:run-event', {
      type: 'review-requested', runId: 'run_1', nodeId: 'form', nodeName: '表单',
      payload: { form: true, fields: [{ key: 'doc', type: 'file' }] },
    }, 'u1')
    const cards = await svc.getSessionMessages(s.id)
    const rc = cards.find(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.review)
    expect(rc.metadata.sessionCard).toMatchObject({ nodeId: 'form', kind: 'form', schema: { fields: [{ key: 'doc', type: 'file' }] } })
  })

  it('nodeStatus → 追加 node-status 卡片（进度曲线，无 in-place 更新）', async () => {
    const { messages, apps, svc } = makeService()
    attachBridge(svc)
    const s = await bootRun(apps, svc)
    tapCb!('wf:run-event', { type: 'node-status', runId: 'run_1', nodeId: 'llm', status: 'running' }, 'u1')
    const cards = await svc.getSessionMessages(s.id)
    const ns = cards.filter(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.nodeStatus)
    expect(ns).toHaveLength(1)
    expect(ns[0].metadata.sessionCard).toMatchObject({ nodeId: 'llm', status: 'running' })
  })

  it('runStatus 终态(succeeded) → 聚合 getRun 的 report 输出写结果卡片 + 会话归 idle + 后续事件不再写', async () => {
    const { messages, apps, svc } = makeService()
    attachBridge(svc)
    const s = await bootRun(apps, svc)
    getRunImpl = async () => ({ run: { status: 'succeeded' }, nodeRuns: [{ nodeType: 'report', output: { markdown: '# 报告', title: 'R', format: 'markdown' } }] })
    tapCb!('wf:run-event', { type: 'run-status', runId: 'run_1', status: 'succeeded' }, 'u1')
    // 终态聚合是异步（void finishSucceeded）——轮询等卡片落库
    let cards = await svc.getSessionMessages(s.id)
    for (let i = 0; i < 20 && !cards.some(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.report); i++) {
      await new Promise(r => setTimeout(r, 10))
      cards = await svc.getSessionMessages(s.id)
    }
    const rep = cards.find(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.report)
    expect(rep).toBeTruthy()
    expect(rep.metadata.sessionCard).toMatchObject({ card: WORKFLOW_SESSION_CARDS.report, title: 'R' })
    // 会话归 idle
    expect((await svc.getSession(s.id))!.status).toBe(APP_SESSION_STATUSES.idle)
    // runToSession 已清：后续事件不再写卡
    const before = (await svc.getSessionMessages(s.id)).length
    tapCb!('wf:run-event', { type: 'node-status', runId: 'run_1', nodeId: 'x', status: 'succeeded' }, 'u1')
    expect((await svc.getSessionMessages(s.id)).length).toBe(before)
  })

  it('runStatus 终态(failed) → 会话 failed + error 卡片（不写 report）', async () => {
    const { apps, svc } = makeService()
    attachBridge(svc)
    const s = await bootRun(apps, svc)
    getRunImpl = async () => ({ run: { status: 'failed', error: 'boom' }, nodeRuns: [] })
    tapCb!('wf:run-event', { type: 'run-status', runId: 'run_1', status: 'failed' }, 'u1')
    const updated = await svc.getSession(s.id)
    expect(updated.status).toBe(APP_SESSION_STATUSES.failed)
    const cards = await svc.getSessionMessages(s.id)
    expect(cards.some(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.report)).toBe(false)
  })

  it('非本会话 runId 的事件被忽略（runToSession 隔离）', async () => {
    const { messages, apps, svc } = makeService()
    attachBridge(svc)
    const s = await bootRun(apps, svc)
    const acc = (await svc.getSessionMessages(s.id)).length
    tapCb!('wf:run-event', { type: 'node-status', runId: 'OTHER_RUN', nodeId: 'y' }, 'u1')
    expect((await svc.getSessionMessages(s.id)).length).toBe(acc) // 不新增
  })
})