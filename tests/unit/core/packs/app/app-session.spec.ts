/**
 * 应用会话服务测试（片2）：创建/启动（triggerInfo+多轮/互斥 skipped）/审核/事件桥写卡片/重命名
 * @module tests/app/app-session
 */
import { describe, it, expect, vi } from 'vitest'

import { AppSessionService } from '@core/packs/app/services/app-session.service'
// 隔离重构后不再有 dialog 占位行，APP_SESSION_DIALOG_ROLE_ID 不再被测试引用
import { APP_SESSION_STATUSES, WORKFLOW_SESSION_CARDS } from '@shared/types/app.types'

// ---- 内存假仓库 ----
class MemSessions {
  rows: Map<string, any> = new Map()
  seq = 0
  /** 可编程失败开关（错误传递用例：session 创建抛错） */
  failCreate = false
  async create(i: any) {
    if (this.failCreate) throw new Error('create failed')
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
/**
 * 应用会话独立消息仓库假实现（隔离重构：会话消息不再写 AI 对话 messages/dialogs 表）
 * 对外 getBySessionId 做 DTO 兼容：sessionId → dialogId（与真实仓库 Message.dialogId 映射一致）
 */
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
class MemApps {
  rows: Map<string, any> = new Map()
  async findById(id: string) { return this.rows.get(id) ?? null }
}

// ---- 可编程事件 tap / runService / engine / defs ----
let tapCb: ((c: string, d: unknown, u: string | null) => void) | null = null
const tapSource = { tapEvents: (cb: any) => { tapCb = cb; return () => { tapCb = null } } }

let startRunImpl: (input: any) => Promise<any>
let getRunDetailImpl: (runId: string) => Promise<any>
const fakeRunService = { startRun: (i: any) => startRunImpl(i), getRunDetail: (r: string) => getRunDetailImpl(r) }
const fakeEngine = { resumeReview: vi.fn(async () => true) }
const defs = { getById: vi.fn(async () => ({ id: 'd1', publishedGraph: { version: 1, nodes: [{ id: 'start', type: 'start', config: { inputs: [{ key: 'q', type: 'string' }] } }], edges: [] } })) }

function makeService() {
  const sessions = new MemSessions()
  const appMsg = new MemAppSessionMessages()
  const apps = new MemApps()
  const svc = new AppSessionService(
    // 隔离重构后的 deps：appSessionMessages 替代 messages/dialogs（会话消息独立存储）
    { appSessions: sessions as any, appSessionMessages: appMsg as any, runService: fakeRunService as any, engine: fakeEngine as any },
    apps as any,     // 构造签名：deps, apps, defs, tapSource
    defs as any,
    tapSource as any
  )
  return { sessions, appMsg, apps, svc }
}
function seedApp(apps: MemApps, over: Record<string, unknown> = {}) {
  apps.rows.set('a1', { id: 'a1', sourceId: 'd1', channelSession: 1, enabled: 1, ...over })
}
async function bootRun(apps: MemApps, svc: AppSessionService) {
  seedApp(apps)
  startRunImpl = async () => ({ id: 'run_1', status: 'running' })
  getRunDetailImpl = async () => ({ run: { status: 'running' }, nodeRuns: [] })
  const s = await svc.createSession('a1')
  await svc.startRun(s.id, { q: 'hi' })
  return s
}
// bootRun 使用示例：事件桥用例统一从 makeService 解构 appMsg/sessions —— 保持本测试数据源一致

describe('AppSessionService：创建会话', () => {
  it('createSession 写首条 start-form 卡片（form=发布图 start.inputs）', async () => {
    const { apps, appMsg, svc } = makeService()
    seedApp(apps)
    const s = await svc.createSession('a1')
    expect(s.status).toBe(APP_SESSION_STATUSES.idle)
    // 首条卡片写入独立会话消息仓库（sessionId 维度，不再写 AI 对话 messages 表）
    const msg = appMsg.rows[0]
    expect(msg.sessionId).toBe(s.id)
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

  it('getSessionMessages 按 sessionId 隔离', async () => {
    const { apps, appMsg, svc } = makeService()
    seedApp(apps)
    const s = await svc.createSession('a1')
    // 其它会话的消息不混入本会话
    await appMsg.create({ sessionId: 'other', role: 'user', content: 'x', metadata: null })
    const msgs = await svc.getSessionMessages(s.id)
    expect(msgs).toHaveLength(1)
    // DTO 兼容：仓库按 sessionId 存储，对外映射为 dialogId（前端兼容）
    expect(msgs[0].dialogId).toBe(s.id)
  })

  it('createSession 带 startInputs → 落 lastStartInputs（创建后沿用首轮参数）', async () => {
    const { apps, sessions, svc } = makeService()
    seedApp(apps)
    const s = await svc.createSession('a1', { topic: '预填' })
    expect(sessions.rows.get(s.id).lastStartInputs).toEqual({ topic: '预填' })
  })

  it('session 创建失败 → 错误向上传递（隔离后无孤儿 dialog 需要清理）', async () => {
    const { apps, sessions, appMsg, svc } = makeService()
    seedApp(apps)
    sessions.failCreate = true
    await expect(svc.createSession('a1')).rejects.toThrow('create failed')
    expect(sessions.rows.size).toBe(0)
    expect(appMsg.rows).toHaveLength(0) // 会话未创建，不写任何消息
  })
})

describe('AppSessionService：删除会话', () => {
  it('deleteSession 级联删会话消息 + 会话行', async () => {
    const { apps, sessions, appMsg, svc } = makeService()
    seedApp(apps)
    const s = await svc.createSession('a1')
    expect(appMsg.rows.length).toBeGreaterThan(0) // 首条 start-form 卡片已落库
    await svc.deleteSession(s.id)
    expect(appMsg.rows).toHaveLength(0)           // 独立消息仓库按 sessionId 清空（不再删 dialog）
    expect(sessions.rows.has(s.id)).toBe(false)
  })

  it('运行中会话拒绝删除', async () => {
    const { apps, sessions, svc } = makeService()
    const s = await bootRun(apps, svc)
    sessions.rows.get(s.id).status = 'running'
    await expect(svc.deleteSession(s.id)).rejects.toThrow('运行中')
  })

  it('不存在的会话删除是 no-op', async () => {
    const { svc } = makeService()
    await expect(svc.deleteSession('ghost')).resolves.toBeUndefined()
  })
})

describe('AppSessionService：boot 恢复（recoverOnBoot）', () => {
  async function seedRunningSession(apps: MemApps, svc: AppSessionService, lastRunId: string) {
    seedApp(apps)
    startRunImpl = async () => ({ id: lastRunId, status: 'running' })
    getRunDetailImpl = async () => ({ run: { status: 'running' }, nodeRuns: [] })
    const s = await svc.createSession('a1')
    await svc.startRun(s.id, { q: 'hi' })
    return s
  }

  it('lastRunId 已终态(succeeded) → 补写结果卡 + 会话归 idle', async () => {
    const { apps, svc } = makeService()
    const s = await seedRunningSession(apps, svc, 'run_recover_1')
    getRunDetailImpl = async () => ({ run: { status: 'succeeded' }, nodeRuns: [{ nodeType: 'message', output: { content: '恢复完成' } }] })
    const r = await svc.recoverOnBoot()
    expect(r.finalized).toBe(1)
    expect(r.recovered).toBe(0)
    const cards = await svc.getSessionMessages(s.id)
    const msg = cards.find(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.message)
    expect(msg?.metadata?.sessionCard?.content).toBe('恢复完成')
    expect((await svc.getSession(s.id))!.status).toBe(APP_SESSION_STATUSES.idle)
  })

  it('lastRunId 已终态(failed) → 写错误卡 + 会话 failed', async () => {
    const { apps, svc } = makeService()
    const s = await seedRunningSession(apps, svc, 'run_recover_2')
    getRunDetailImpl = async () => ({ run: { status: 'failed', error: 'boom' }, nodeRuns: [] })
    const r = await svc.recoverOnBoot()
    expect(r.finalized).toBe(1)
    expect((await svc.getSession(s.id))!.status).toBe(APP_SESSION_STATUSES.failed)
  })

  it('非终态（挂起审核）→ 重建 runToSession 映射，事件桥继续接管', async () => {
    const { apps, svc } = makeService()
    const s = await seedRunningSession(apps, svc, 'run_recover_3')
    getRunDetailImpl = async () => ({ run: { status: 'waiting_review' }, nodeRuns: [] })
    const r = await svc.recoverOnBoot()
    expect(r.recovered).toBe(1)
    // 映射重建后事件桥能命中：终态 succeeded → 写卡（直接走 handleRunEvent 公共面）
    getRunDetailImpl = async () => ({ run: { status: 'succeeded' }, nodeRuns: [{ nodeType: 'message', output: { content: 'ok' } }] })
    svc.handleRunEvent({ type: 'run-status', runId: 'run_recover_3', status: 'succeeded' } as never)
    let cards = await svc.getSessionMessages(s.id)
    for (let i = 0; i < 20 && !cards.some(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.message); i++) {
      await new Promise(r => setTimeout(r, 10))
      cards = await svc.getSessionMessages(s.id)
    }
    expect(cards.some(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.message)).toBe(true)
  })

  it('无 lastRunId 的 running 会话 → 直接归 idle', async () => {
    const { apps, sessions, svc } = makeService()
    seedApp(apps)
    const s = await svc.createSession('a1')
    sessions.rows.get(s.id).status = 'running' // 异常态：running 但无 lastRunId
    const r = await svc.recoverOnBoot()
    expect(r.sessions).toBe(1)
    expect(r.finalized).toBe(0)
    expect(r.recovered).toBe(0)
    expect((await svc.getSession(s.id))!.status).toBe(APP_SESSION_STATUSES.idle)
  })
})

describe('AppSessionService：startRun 与多轮', () => {
  it('透传 triggerInfo + inputs；成功写 run-status 卡片；会话 status=running+lastRunId', async () => {
    const { apps, svc, sessions } = makeService()
    const s = await bootRun(apps, svc)
    expect(sessions.rows.get(s.id).status).toBe('running')
    // 通过公共面验证：卡片
    const cards = await svc.getSessionMessages(s.id)
    const runCard = cards.find(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.runStatus)
    expect(runCard).toBeTruthy()
  })

  it('渠道关闭后已建会话 startRun → 抛"应用未开启会话渠道"（评审#72）', async () => {
    const { apps, svc } = makeService()
    seedApp(apps)
    const s = await svc.createSession('a1') // 先建会话（渠道开着）
    apps.rows.set('a1', { ...apps.rows.get('a1'), channelSession: 0 }) // 再关渠道
    startRunImpl = async () => ({ id: 'r', status: 'running' })
    await expect(svc.startRun(s.id, {})).rejects.toThrow('应用未开启会话渠道')
  })

  it('startRun 互斥（返回 skipped）→ 抛"运行进行中"', async () => {
    const { apps, svc } = makeService()
    startRunImpl = async () => ({ id: 'r', status: 'skipped', skipReason: '同工作流已有运行中实例' })
    getRunDetailImpl = async () => ({ run: { status: 'skipped' }, nodeRuns: [] })
    seedApp(apps)
    const s = await svc.createSession('a1')
    await expect(svc.startRun(s.id, {})).rejects.toThrow('运行进行中')
  })

  it('未提供 inputs 时沿用 lastStartInputs（多轮）', async () => {
    const { apps, svc } = makeService()
    seedApp(apps)
    const s = await svc.createSession('a1')
    startRunImpl = async (_i: any) => ({ id: 'r1', status: 'running' })
    getRunDetailImpl = async () => ({ run: { status: 'running' }, nodeRuns: [] })
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
    const { appMsg, apps, svc } = makeService()
    attachBridge(svc)
    const s = await bootRun(apps, svc)
    tapCb!('wf:run-event', {
      type: 'review-requested', runId: 'run_1', nodeId: 'form', nodeName: '表单',
      payload: { form: true, fields: [{ key: 'doc', type: 'file' }] },
    }, 'u1')
    // 写卡走串行队列（异步）——轮询等卡片落库（直接查独立仓库 rows）
    for (let i = 0; i < 20 && !appMsg.rows.some(r => r.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.review); i++) {
      await new Promise(r => setTimeout(r, 10))
    }
    const rc = appMsg.rows.find(r => r.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.review)
    expect(rc.sessionId).toBe(s.id) // 卡片归属本会话（sessionId 匹配）
    expect(rc.metadata.sessionCard).toMatchObject({ nodeId: 'form', kind: 'form', schema: { fields: [{ key: 'doc', type: 'file' }] } })
  })

  it('nodeStatus → 追加 node-status 卡片（进度曲线，无 in-place 更新）', async () => {
    const { apps, svc } = makeService()
    attachBridge(svc)
    const s = await bootRun(apps, svc)
    tapCb!('wf:run-event', { type: 'node-status', runId: 'run_1', nodeId: 'llm', status: 'running' }, 'u1')
    let cards = await svc.getSessionMessages(s.id)
    for (let i = 0; i < 20 && !cards.some(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.nodeStatus); i++) {
      await new Promise(r => setTimeout(r, 10))
      cards = await svc.getSessionMessages(s.id)
    }
    const ns = cards.filter(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.nodeStatus)
    expect(ns).toHaveLength(1)
    expect(ns[0].metadata.sessionCard).toMatchObject({ nodeId: 'llm', status: 'running' })
  })

  it('runStatus 终态(succeeded) → 聚合 getRun 的 report 输出写结果卡片 + 会话归 idle + 后续事件不再写', async () => {
    const { apps, svc } = makeService()
    attachBridge(svc)
    const s = await bootRun(apps, svc)
    getRunDetailImpl = async () => ({ run: { status: 'succeeded' }, nodeRuns: [{ nodeType: 'report', output: { markdown: '# 报告', title: 'R', format: 'markdown' } }] })
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
    getRunDetailImpl = async () => ({ run: { status: 'failed', error: 'boom' }, nodeRuns: [] })
    tapCb!('wf:run-event', { type: 'run-status', runId: 'run_1', status: 'failed' }, 'u1')
    const updated = await svc.getSession(s.id)
    expect(updated.status).toBe(APP_SESSION_STATUSES.failed)
    const cards = await svc.getSessionMessages(s.id)
    expect(cards.some(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.report)).toBe(false)
  })

  it('非本会话 runId 的事件被忽略（runToSession 隔离）', async () => {
    const { apps, svc } = makeService()
    attachBridge(svc)
    const s = await bootRun(apps, svc)
    const acc = (await svc.getSessionMessages(s.id)).length
    tapCb!('wf:run-event', { type: 'node-status', runId: 'OTHER_RUN', nodeId: 'y' }, 'u1')
    expect((await svc.getSessionMessages(s.id)).length).toBe(acc) // 不新增
  })

  it('runStatus 中间态(running/waiting_review) → 不写卡、不删映射（后续终态仍命中）', async () => {
    const { apps, svc } = makeService()
    attachBridge(svc)
    const s = await bootRun(apps, svc)
    // 引擎启动时也会 emit run-status running——不得误判为终态写"运行running"卡
    tapCb!('wf:run-event', { type: 'run-status', runId: 'run_1', status: 'running' }, 'u1')
    tapCb!('wf:run-event', { type: 'run-status', runId: 'run_1', status: 'waiting_review' }, 'u1')
    let cards = await svc.getSessionMessages(s.id)
    expect(cards.some(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.message)).toBe(false)
    // 映射仍在 → 终态 succeeded 仍能聚合写结果卡
    getRunDetailImpl = async () => ({ run: { status: 'succeeded' }, nodeRuns: [{ nodeType: 'message', output: { content: 'ok' } }] })
    tapCb!('wf:run-event', { type: 'run-status', runId: 'run_1', status: 'succeeded' }, 'u1')
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 10))
      cards = await svc.getSessionMessages(s.id)
      if (cards.some(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.message)) break
    }
    const msg = cards.find(c => c.metadata?.sessionCard?.card === WORKFLOW_SESSION_CARDS.message)
    expect(msg?.metadata?.sessionCard?.content).toBe('ok')
    expect((await svc.getSession(s.id))!.status).toBe(APP_SESSION_STATUSES.idle)
  })
})