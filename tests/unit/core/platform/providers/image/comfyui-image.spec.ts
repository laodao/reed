/**
 * ComfyUI 生成网关 图像 Provider 专项测试
 * @module tests/unit/core/platform/providers/image/comfyui-image
 * @description 钉死 /api/image 调用链的两个关键行为：
 *  1. POST 走 node:http（无 undici 300 秒响应头超时）——ComfyUI 队列被 H3 视频任务
 *     占用时，/api/image 排队等待可达数分钟，全局 fetch（undici headersTimeout=300s）
 *     会将其掐断（实跑踩坑：V3 画面生产全军覆没于"fetch failed"）；
 *  2. 整体等待上限（默认 15 分钟）与超时错误消息；网关业务错误（HTTP 4xx/5xx、
 *     ok=false）的透传形态。
 */
import { describe, it, expect, afterAll } from 'vitest'
import * as http from 'http'
import type { Server } from 'http'
import { ComfyUIImageProvider } from '@core/platform/providers/image/sdk/comfyui-image.provider'
import { postJsonOverHttp } from '@core/platform/providers/image/sdk/comfyui-image.provider'

const servers: Server[] = []

afterAll(() => {
  for (const s of servers) s.close()
})

/** 起一个一次性 http 服务：delayMs 后按 handler 返回 */
function startDelayed(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void, delayMs: number): Promise<string> {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let raw = ''
      req.on('data', (c: Buffer) => { raw += c })
      req.on('end', () => {
        setTimeout(() => handler(req, res), delayMs)
        void raw
      })
    })
    servers.push(s)
    s.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(s.address() as { port: number }).port}`))
  })
}

function makeProvider(baseUrl: string): ComfyUIImageProvider {
  return new ComfyUIImageProvider({ baseUrl, apiKey: '', enabled: true } as never)
}

describe('ComfyUIImageProvider（生成网关图像）', () => {
  it('慢响应（>1s）正常出图——POST 不受 undici 300 秒响应头超时约束', async () => {
    const base = await startDelayed((_, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, path: 'gen_output/x/1.png', url: '/api/file?p=gen_output/x/1.png' }))
    }, 1200)
    const provider = makeProvider(base)
    const r = await provider.generateImage({ model: 'krea2', prompt: 'a quiet riverside at dusk, no text', width: 896, height: 1152 } as never)
    expect(r.success).toBe(true)
    expect(r.images?.[0]?.url).toContain('/api/file?p=gen_output/x/1.png')
  })

  it('网关业务错误透传：HTTP 400 → 网关返回 HTTP 400', async () => {
    const base = await startDelayed((_, res) => {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, error: 'bad refs' }))
    }, 50)
    const provider = makeProvider(base)
    const r = await provider.generateImage({ model: 'krea2', prompt: 'x' } as never)
    expect(r.success).toBe(false)
    expect(r.error).toContain('HTTP 400')
  })

  it('ok=false 时透传网关 error', async () => {
    const base = await startDelayed((_, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'ComfyUI 队列异常' }))
    }, 50)
    const provider = makeProvider(base)
    const r = await provider.generateImage({ model: 'krea2', prompt: 'x' } as never)
    expect(r.success).toBe(false)
    expect(r.error).toContain('队列异常')
  })

  it('postJsonOverHttp：超过 deadline 以明确消息超时（不再报 UND_ERR_HEADERS_TIMEOUT）', async () => {
    const base = await startDelayed((_, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true }))
    }, 3000)
    await expect(postJsonOverHttp(`${base}/api/image`, { prompt: 'x' }, 300)).rejects.toThrow(/响应超时/)
  })
})
