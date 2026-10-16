/**
 * 百炼视频 provider HappyHorse 适配单测（评审 2026-10-09）
 * 验证：happyhorse 系时长钳制 3~15 秒；水印显式关闭；input.media 首帧结构。
 * @module tests/unit/core/platform/providers/video/bailian-happyhorse
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { BailianVideoProvider } from '@core/platform/providers/video/sdk/bailian-video.provider'

function makeProvider(): BailianVideoProvider {
  return new BailianVideoProvider({
    id: 'pc_bailian',
    name: '阿里百炼',
    apiKey: 'sk-test',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  } as never)
}

describe('百炼视频 HappyHorse 适配（2026-10-09）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('happyhorse 模型：时长 16 → 钳制 15；水印显式 false；input.media 首帧结构', async () => {
    const calls: Array<{ url: string; body: Record<string, any> }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) })
      return { ok: true, text: async () => JSON.stringify({ output: { task_id: 't1' } }) }
    }))
    const r = await makeProvider().generateVideo({
      model: 'happyhorse-1.1-i2v',
      prompt: '废弃园区爆破烟尘',
      image: 'https://example.com/frame.png',
      duration: 16,
    } as never)
    expect(r.success).toBe(true)
    expect(calls[0].url).toContain('/services/aigc/video-generation/video-synthesis')
    expect(calls[0].body.model).toBe('happyhorse-1.1-i2v')
    expect(calls[0].body.input.media[0].type).toBe('first_frame')
    expect(calls[0].body.parameters.duration).toBe(15)
    expect(calls[0].body.parameters.watermark).toBe(false)
  })

  it('happyhorse 时长 2 → 钳制下限 3；wan 模型时长原样透传', async () => {
    const calls: Array<{ body: Record<string, any> }> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body?: string }) => {
      calls.push({ body: JSON.parse(String(init?.body ?? '{}')) })
      return { ok: true, text: async () => JSON.stringify({ output: { task_id: 't1' } }) }
    }))
    const p = makeProvider()
    await p.generateVideo({
      model: 'happyhorse-1.0-i2v',
      image: 'https://example.com/f.png',
      duration: 2,
    } as never)
    expect(calls[0].body.parameters.duration).toBe(3)
    await p.generateVideo({
      model: 'wan2.7-i2v',
      image: 'https://example.com/f.png',
      duration: 6,
    } as never)
    expect(calls[1].body.parameters.duration).toBe(6)
    expect(calls[1].body.parameters.watermark).toBe(false)
  })
})
