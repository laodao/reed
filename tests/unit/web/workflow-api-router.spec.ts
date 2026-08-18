/**
 * C3 工作流 REST API 路由测试：invoke（override 透传）/ stop（租户校验）/ SSE 事件流
 * @module tests/web/workflow-api-router
 * @description express 真实路由 + 内存假 runService + 可编程事件 tap 源。
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import express, { type Express } from 'express'
import cookieParser from 'cookie-parser'
import * as http from 'node:http'
import { attachUser } from '../../../src/web/server/auth/middleware'
import { signToken, JWT_COOKIE_NAME, configureJwtSecret } from '../../../src/web/server/auth/jwt'

import { createWorkflowApiRouter, type EventTapSource } from '../../../src/web/server/api/workflow-api-router'

beforeAll(() => configureJwtSecret('test-secret'))

// ---- 假 runService ----
const startedInputs: any[] = []
let runDetail: any = { run: { id: 'run_1', userId: 'u1', status: 'running', triggerInfo: { shareToken: 'tok123' } }, nodeRuns: [] }
const fakeRunService = {
  async startRun(input: any) {
    startedInputs.push(input)
    if (input.definitionId === 'missing') throw new Error('工作流不存在')
    return { id: 'run_1', status: 'running', skipReason: null }
  },
  async cancelRun(runId: string, userId: string) {
    return runId === 'run_1' && userId === 'u1'
  },
  async getRunDetail(runId: string) {
    return runId === 'run_1' ? runDetail : null
  },
}

// ---- 假 definitions（分享面） ----
const sharedDef = {
  id: 'd1', name: '分享的流', description: 'desc', userId: 'u1',
  publishedGraph: { nodes: [{ type: 'start', config: { inputs: [{ key: 'q', type: 'string', required: true }] } }] },
}
const fakeDefinitions = {
  async getByShareToken(token: string) {
    if (token === 'tok123') return sharedDef
    if (token === 'notshared') return { ...sharedDef, id: 'd2', userId: null }
    return null
  },
}

// ---- 可编程事件 tap 源 ----
let tapCb: ((channel: string, data: unknown, userId: string | null) => void) | null = null
const tapSource: EventTapSource = {
  tapEvents(cb) {
    tapCb = cb
    return () => { tapCb = null }
  },
}

const app: Express = express()
app.use(express.json())
app.use(cookieParser())
app.use(attachUser)
app.use('/api/workflow', createWorkflowApiRouter({ getDeps: () => ({ runService: fakeRunService as any, definitions: fakeDefinitions }), tapSource }))

const server = http.createServer(app)
let baseUrl = ''
afterAll(() => new Promise<void>(r => server.close(() => r())))

const authHeaders = (userId = 'u1'): Record<string, string> => {
  const token = signToken({ userId } as any)
  return { Cookie: `${JWT_COOKIE_NAME}=${token}` }
}

/** 启动监听（幂等） */
let listening = false
async function ensureListen(): Promise<void> {
  if (listening) return
  await new Promise<void>(r => server.listen(0, () => {
    baseUrl = `http://127.0.0.1:${(server.address() as http.AddressInfo).port}`
    listening = true
    r()
  }))
}

describe('C3 REST：POST /invoke/:definitionId', () => {
  it('透传 inputs + override + triggerInfo.source=api', async () => {
    await ensureListen()
    const res = await fetch(`${baseUrl}/api/workflow/invoke/d1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders('u1') },
      body: JSON.stringify({ inputs: { q: 'hi' }, override: { llm1: { model: 'x' } } }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, data: { runId: 'run_1', status: 'running' } })
    expect(startedInputs.at(-1)).toMatchObject({
      definitionId: 'd1',
      triggerType: 'manual',
      triggerInfo: { source: 'api' },
      inputs: { q: 'hi' },
      configOverrides: { llm1: { model: 'x' } },
    })
  })

  it('未登录 401', async () => {
    await ensureListen()
    const res = await fetch(`${baseUrl}/api/workflow/invoke/d1`, { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('工作流不存在 → 400', async () => {
    await ensureListen()
    const res = await fetch(`${baseUrl}/api/workflow/invoke/missing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: '{}',
    })
    expect(res.status).toBe(400)
  })
})

describe('C3 REST：POST /run/:runId/stop', () => {
  it('本人运行可取消', async () => {
    await ensureListen()
    const res = await fetch(`${baseUrl}/api/workflow/run/run_1/stop`, { method: 'POST', headers: authHeaders('u1') })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, data: { cancelled: true } })
  })

  it('他人运行 → 404（不泄露存在性）', async () => {
    await ensureListen()
    const res = await fetch(`${baseUrl}/api/workflow/run/run_1/stop`, { method: 'POST', headers: authHeaders('u2') })
    expect(res.status).toBe(404)
  })
})

describe('C3 REST：GET /run/:runId/events（SSE）', () => {
  it('先推快照，后续事件按 runId+租户过滤，终态推 done 关流', async () => {
    await ensureListen()
    runDetail = { run: { id: 'run_1', userId: 'u1', status: 'running' }, nodeRuns: [{ nodeId: 'a', status: 'succeeded' }] }

    const ac = new AbortController()
    const res = await fetch(`${baseUrl}/api/workflow/run/run_1/events`, { headers: { ...authHeaders('u1'), Accept: 'text/event-stream' }, signal: ac.signal })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    // 流式读取（按空行分帧）
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
    const frameText = (i: number): string => frames[i] ?? ''

    await readUntil(() => frames.length >= 1)
    expect(frameText(0)).toContain('event: snapshot')
    expect(frameText(0)).toContain('"nodeId":"a"')

    // 无关事件（其它通道 / 其它 run / 其它租户）不推
    tapCb?.('other-channel', { runId: 'run_1' }, 'u1')
    tapCb?.('wf:run-event', { type: 'node-status', runId: 'run_2' }, 'u1')
    tapCb?.('wf:run-event', { type: 'node-status', runId: 'run_1' }, 'u2')
    tapCb?.('wf:run-event', { type: 'node-status', runId: 'run_1', nodeId: 'b', status: 'running' }, 'u1')
    await readUntil(() => frames.length >= 2)
    expect(frameText(1)).toContain('event: node-status')
    expect(frameText(1)).toContain('"nodeId":"b"')

    // 终态事件 → done 后关流
    tapCb?.('wf:run-event', { type: 'run-status', runId: 'run_1', status: 'succeeded' }, 'u1')
    await readUntil(() => frames.length >= 4)
    expect(frameText(2)).toContain('event: run-status')
    expect(frameText(3)).toContain('event: done')
    // 流已由服务端 end（下一次 read 返回 done）
    const tail = await reader.read()
    expect(tail.done).toBe(true)
  })

  it('已终态运行：快照 + done 立即关流', async () => {
    await ensureListen()
    runDetail = { run: { id: 'run_1', userId: 'u1', status: 'succeeded' }, nodeRuns: [] }
    const res = await fetch(`${baseUrl}/api/workflow/run/run_1/events`, { headers: authHeaders('u1') })
    const text = await res.text()
    expect(text).toContain('event: snapshot')
    expect(text).toContain('event: done')
  })

  it('他人运行 → 404', async () => {
    await ensureListen()
    const res = await fetch(`${baseUrl}/api/workflow/run/run_1/events`, { headers: authHeaders('u2') })
    expect(res.status).toBe(404)
  })
})

describe('C3 免登录分享：GET /share/:token', () => {
  it('返回元信息 + start 输入 schema（无需登录）', async () => {
    await ensureListen()
    const res = await fetch(`${baseUrl}/api/workflow/share/tok123`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, data: { definitionId: 'd1', name: '分享的流', inputs: [{ key: 'q' }] } })
  })

  it('无效令牌 → 404', async () => {
    await ensureListen()
    const res = await fetch(`${baseUrl}/api/workflow/share/badtoken`)
    expect(res.status).toBe(404)
  })
})

describe('C3 免登录分享：POST /share/:token/invoke', () => {
  it('以定义所有者身份启动并带 share 触发信息（禁 override）', async () => {
    await ensureListen()
    const res = await fetch(`${baseUrl}/api/workflow/share/tok123/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: { q: 'x' }, override: { n: { a: 1 } } }),
    })
    expect(res.status).toBe(200)
    const last = startedInputs.at(-1)
    expect(last).toMatchObject({ definitionId: 'd1', triggerInfo: { source: 'share', shareToken: 'tok123' }, inputs: { q: 'x' } })
    // override 不透传（实验参数不对访客开放）
    expect(last.configOverrides).toBeUndefined()
  })

  it('无所有者的定义（PC 单机数据）→ 400', async () => {
    await ensureListen()
    const res = await fetch(`${baseUrl}/api/workflow/share/notshared/invoke`, { method: 'POST' })
    expect(res.status).toBe(400)
  })
})

describe('C3 免登录分享：GET /share/:token/run/:runId/events（SSE）', () => {
  it('token↔run 配对校验 + 快照脱敏 + 终态关流', async () => {
    await ensureListen()
    runDetail = { run: { id: 'run_1', userId: 'u1', status: 'succeeded', triggerInfo: { shareToken: 'tok123' } }, nodeRuns: [] }
    const res = await fetch(`${baseUrl}/api/workflow/share/tok123/run/run_1/events`)
    const text = await res.text()
    expect(text).toContain('event: snapshot')
    expect(text).toContain('event: done')
    expect(text).not.toContain('"userId"') // 快照脱敏：免登录面不回传租户信息
  })

  it('run 的 shareToken 与路径 token 不匹配 → 404', async () => {
    await ensureListen()
    const res = await fetch(`${baseUrl}/api/workflow/share/tok123/run/run_2/events`)
    expect(res.status).toBe(404)
  })
})
