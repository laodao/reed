/**
 * SSE 混合流集成测试（10-event-system §5.4 sse 行，M2 平台化）：
 * streamRunEvents 内部切换为聚合 replay+订阅混合流后，端点契约不变——
 * 快照先行 / 历史事件回放 / 实时事件 / 终态 done 关流 / 载荷仍是 WorkflowRunEvent 五型。
 *
 * 真实 PlatformEventBus + 内存 SQLite（Node 环境模拟，不起 Web 整机）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express, { type Express } from 'express'
import cookieParser from 'cookie-parser'
import * as http from 'node:http'
import { DataSource } from 'typeorm'
import { attachUser } from '../../../src/web/server/auth/middleware'
import { signToken, JWT_COOKIE_NAME, configureJwtSecret } from '../../../src/web/server/auth/jwt'
import { createWorkflowApiRouter } from '../../../src/web/server/api/workflow-api-router'
import { PlatformEventBus } from '@core/platform/services/event-system/event-bus.service'
import {
  PlatformEventCursorEntity,
  PlatformEventDeadLetterEntity,
  PlatformEventEntity,
} from '@core/database/entities/platform-event.entities'
import { runWithUser } from '@core/context/user-context'

beforeAll(() => configureJwtSecret('test-secret'))

const OWNER = 'u1'
let runDetail: any = { run: { id: 'run_1', userId: OWNER, status: 'running', triggerInfo: null }, nodeRuns: [] }
const fakeRunService = {
  async startRun() { throw new Error('本套件不测 invoke') },
  async cancelRun() { return false },
  async getRunDetail(runId: string) { return runDetail?.run?.id === runId ? runDetail : null },
}

let ds: DataSource
let bus: PlatformEventBus
const app: Express = express()
const server = http.createServer(app)
let baseUrl = ''

/** 以 run 所有者身份发布 run 生命周期平台事件（producer 适配器的直写形态） */
async function publishRunEvent(runId: string, type: string, payload: Record<string, unknown>) {
  await runWithUser(OWNER, () =>
    bus.publish({
      type,
      aggregate: { kind: 'workflow_run', id: runId },
      actor: { kind: 'workflow', id: null },
      payload: { runId, ...payload },
      correlationId: runId,
    })
  )
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [PlatformEventEntity, PlatformEventCursorEntity, PlatformEventDeadLetterEntity],
    synchronize: true,
  })
  await ds.initialize()
  bus = new PlatformEventBus(ds, { sweepIntervalMs: 20 })
  await bus.start()

  app.use(express.json())
  app.use(cookieParser())
  app.use(attachUser)
  app.use('/api/workflow', createWorkflowApiRouter({
    getDeps: () => ({ runService: fakeRunService as any }),
    getEventBus: () => bus,
    // tapSource 不注入：走默认 WebSocketEventEmitter 单例也无妨（bus 路径优先）
  }))
  await new Promise<void>(r => server.listen(0, () => {
    baseUrl = `http://127.0.0.1:${(server.address() as http.AddressInfo).port}`
    r()
  }))
})

afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()))
  await bus.stop()
  await ds.destroy()
})

const authHeaders = (userId = OWNER): Record<string, string> => {
  const token = signToken({ userId } as any)
  return { Cookie: `${JWT_COOKIE_NAME}=${token}` }
}

/** 读 SSE 帧流（按空行分帧） */
function makeFrameReader(res: Response) {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const frames: string[] = []
  const readUntil = async (pred: () => boolean): Promise<void> => {
    while (!pred()) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        frames.push(buffer.slice(0, idx))
        buffer = buffer.slice(idx + 2)
      }
    }
  }
  return { frames, readUntil, read: () => reader.read() }
}

describe('SSE 混合流：GET /run/:runId/events（平台总线路径）', () => {
  it('快照先行 → replay 历史事件 → 实时事件 → 终态 done 关流', async () => {
    runDetail = { run: { id: 'run_1', userId: OWNER, status: 'running', triggerInfo: null }, nodeRuns: [] }

    // 连接前的历史事件（模拟快照后/订阅前窗口已落库的事件）
    await publishRunEvent('run_1', 'workflow.run.node-status', { nodeId: 'a', status: 'running' })

    const res = await fetch(`${baseUrl}/api/workflow/run/run_1/events`, {
      headers: { ...authHeaders(), Accept: 'text/event-stream' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const { frames, readUntil, read } = makeFrameReader(res)

    // 1) 快照先行
    await readUntil(() => frames.length >= 1)
    expect(frames[0]).toContain('event: snapshot')

    // 2) replay 补推历史事件（载荷为五型：type 重建为 node-status）
    await readUntil(() => frames.length >= 2)
    expect(frames[1]).toContain('event: node-status')
    expect(frames[1]).toContain('"nodeId":"a"')

    // 3) 实时事件直通
    await publishRunEvent('run_1', 'workflow.run.node-status', { nodeId: 'b', status: 'running' })
    await readUntil(() => frames.length >= 3)
    expect(frames[2]).toContain('event: node-status')
    expect(frames[2]).toContain('"nodeId":"b"')

    // 4) 终态事件 → done 关流
    await publishRunEvent('run_1', 'workflow.run.run-status', { status: 'succeeded' })
    await readUntil(() => frames.length >= 5)
    expect(frames[3]).toContain('event: run-status')
    expect(frames[3]).toContain('"status":"succeeded"')
    expect(frames[4]).toContain('event: done')
    const tail = await read()
    expect(tail.done).toBe(true) // 服务端已 end

    runDetail = { run: { id: 'run_1', userId: OWNER, status: 'succeeded', triggerInfo: null }, nodeRuns: [] }
  })

  it('异租户事件不推（run 所有者之外的 platform 事件被过滤）', async () => {
    // 独立 runId：聚合维度隔离历史事件，避免上个用例的终态事件被 replay 命中
    runDetail = { run: { id: 'run_2', userId: OWNER, status: 'running', triggerInfo: null }, nodeRuns: [] }
    const ac = new AbortController()
    const res = await fetch(`${baseUrl}/api/workflow/run/run_2/events`, {
      headers: { ...authHeaders(), Accept: 'text/event-stream' },
      signal: ac.signal,
    })
    const { frames, readUntil } = makeFrameReader(res)
    await readUntil(() => frames.length >= 1)
    expect(frames[0]).toContain('event: snapshot')

    // u2 的同聚合事件（异租户）→ 不推；随后终态关流（说明流仍活着，只是过滤了异租户）
    await runWithUser('u2', () =>
      bus.publish({
        type: 'workflow.run.node-status',
        aggregate: { kind: 'workflow_run', id: 'run_2' },
        payload: { runId: 'run_2', nodeId: 'evil', status: 'running' },
      })
    )
    await publishRunEvent('run_2', 'workflow.run.run-status', { status: 'failed', error: 'x' })
    await readUntil(() => frames.some(f => f.includes('event: done')))
    expect(frames.some(f => f.includes('"nodeId":"evil"'))).toBe(false)

    ac.abort()
    runDetail = { run: { id: 'run_2', userId: OWNER, status: 'failed', triggerInfo: null }, nodeRuns: [] }
  })

  it('已终态运行：快照 + done 立即关流（不订阅）', async () => {
    runDetail = { run: { id: 'run_3', userId: OWNER, status: 'succeeded', triggerInfo: null }, nodeRuns: [] }
    const res = await fetch(`${baseUrl}/api/workflow/run/run_3/events`, { headers: authHeaders() })
    const text = await res.text()
    expect(text).toContain('event: snapshot')
    expect(text).toContain('event: done')
  })

  it('他人运行 → 404（不泄露存在性）', async () => {
    runDetail = { run: { id: 'run_4', userId: OWNER, status: 'running', triggerInfo: null }, nodeRuns: [] }
    const res = await fetch(`${baseUrl}/api/workflow/run/run_4/events`, { headers: authHeaders('u2') })
    expect(res.status).toBe(404)
  })
})
