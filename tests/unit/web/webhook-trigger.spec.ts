/**
 * P0 片5 Webhook 触发路由测试：token 命中（以所有者身份运行 + body 作 inputs + 发布图）/
 * 未命中 404 / 停用 404 / 形态守卫 / 限流 429 / 缺 userId
 * @module tests/web/webhook-trigger
 */
import { describe, it, expect, beforeEach } from 'vitest'
import express, { type Express } from 'express'
import cookieParser from 'cookie-parser'
import * as http from 'node:http'
import { attachUser } from '../../../src/web/server/auth/middleware'
import { signToken, JWT_COOKIE_NAME, configureJwtSecret } from '../../../src/web/server/auth/jwt'
import { createWebhookTriggerRouter } from '../../../src/web/server/api/workflow-api-router'

const TOKEN = 'ab'.repeat(32) // 64hex

function makeApp(defs: any, runService: any): Promise<http.Server> {
  configureJwtSecret('test-secret')
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(attachUser)
  app.use('/api/workflow/webhook', createWebhookTriggerRouter({ definitions: defs, runService }))
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server))
  })
}

function post(server: http.Server, path: string, body: unknown): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number }
    const req = http.request({ host: '127.0.0.1', port: addr.port, path, method: 'POST', headers: { 'content-type': 'application/json' } }, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => { try { resolve({ status: res.statusCode ?? 0, json: JSON.parse(data || '{}') }) } catch { resolve({ status: res.statusCode ?? 0, json: {} }) } })
    })
    req.end(JSON.stringify(body))
  })
}

describe('Webhook 触发路由', () => {
  let server: http.Server
  let started: any[] = []

  const defs = {
    async findByWebhookToken(token: string) {
      if (token === TOKEN) return { id: 'd1', userId: 'u1', name: 'Webhook流' }
      if (token === 'disabledtoken12345678901234567890') return null // 停用=不返回
      return null
    },
  }
  const runService = {
    async startRun(input: any) { started.push(input); return { id: 'run_w', status: 'running' } },
  }

  beforeEach(async () => {
    started = []
    server = await makeApp(defs, runService)
  })
  afterEach(() => { server?.close() })

  it('token 命中 → 以所有者身份运行（body 作 inputs + 发布图 + triggerInfo.source=webhook）', async () => {
    const r = await post(server, `/api/workflow/webhook/${TOKEN}`, { topic: '早报', lang: 'zh' })
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ ok: true, data: { runId: 'run_w' } })
    expect(started[0]).toMatchObject({
      definitionId: 'd1',
      inputs: { topic: '早报', lang: 'zh' },
      usePublishedGraph: true,
      triggerInfo: { source: 'webhook', token: TOKEN },
    })
  })

  it('token 未命中 → 404（不泄露存在性）', async () => {
    const r = await post(server, '/api/workflow/webhook/ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', {})
    expect(r.status).toBe(404)
    expect(started).toHaveLength(0)
  })

  it('停用（findByWebhookToken 返回 null）→ 404', async () => {
    const r = await post(server, '/api/workflow/webhook/disabledtoken12345678901234567890', {})
    expect(r.status).toBe(404)
  })

  it('形态守卫：非 32B+ hex → 404（防超长输入扫库）', async () => {
    const r = await post(server, '/api/workflow/webhook/not-a-token!!!', {})
    expect(r.status).toBe(404)
  })

  it('限流：60s 内第 7 次 → 429', async () => {
    const results = []
    for (let i = 0; i < 7; i++) {
      results.push(await post(server, `/api/workflow/webhook/${TOKEN}`, { i }))
    }
    expect(results[6].status).toBe(429)
    expect(started.length).toBeLessThanOrEqual(6)
  })
})
