/**
 * ComfyUI H3 画质/步数透传（评审 #105）单测
 * @module tests/unit/core/platform/providers/video/comfyui-h3-params
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ComfyUIVideoProvider } from '@core/platform/providers/video/sdk/comfyui-video.provider'

const GW = 'http://192.168.2.128:8190'

function makeProvider(): ComfyUIVideoProvider {
  return new ComfyUIVideoProvider({
    id: 'pc_comfy',
    name: 'ComfyUI',
    apiKey: '',
    baseUrl: GW,
  } as never)
}

describe('ComfyUI H3 提交参数（quality/steps 透传）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('quality=low & steps=4 透传；frames=秒×24+1；竖版 portrait', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) })
      return { ok: true, text: async () => JSON.stringify({ ok: true, task_id: 't1' }) }
    }))
    const p = makeProvider()
    const r = await p.generateVideo({
      model: 'h3',
      prompt: '测试 prompt',
      image: 'data:image/png;base64,aGk=',
      duration: 5,
      width: 480,
      height: 864,
      quality: 'low',
      steps: 4,
    } as never)
    expect(r.success).toBe(true)
    expect(calls.length).toBe(1)
    expect(calls[0].url).toContain('/api/video')
    expect(calls[0].body.quality).toBe('low')
    expect(calls[0].body.steps).toBe(4)
    expect(calls[0].body.frames).toBe(5 * 24 + 1) // 121
    expect(calls[0].body.aspect).toBe('portrait')
  })

  it('未传 quality/steps → 默认 high / steps=20（不回归既有行为）', async () => {
    const calls: Array<{ body: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body?: string }) => {
      calls.push({ body: JSON.parse(String(init?.body ?? '{}')) })
      return { ok: true, text: async () => JSON.stringify({ ok: true, task_id: 't1' }) }
    }))
    const p = makeProvider()
    const r = await p.generateVideo({
      model: 'h3',
      prompt: 'p',
      image: 'data:image/png;base64,aGk=',
      duration: 10,
      width: 704,
      height: 1248,
    } as never)
    expect(r.success).toBe(true)
    expect(calls[0].body.quality).toBe('high')
    expect(calls[0].body.steps).toBe(20)
    expect(calls[0].body.frames).toBe(10 * 24 + 1)
  })
})
