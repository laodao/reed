/**
 * DashScope Provider · 可灵（kling）路由与参数集 · 单元测试
 * @see src/core/image-providers/dashscope-image.provider.ts
 *
 * 验证目标（design image-provider-capability-model-design §5.1 + 研究 image-provider-api-params-research）：
 * 1. kling/* 模型路由到官方 image-generation 端点（非 image-synthesis）
 * 2. 请求头带 X-DashScope-Async: enable（官方强制异步）
 * 3. 请求体只含官方支持参数：n / aspect_ratio / resolution / watermark
 *    —— 不发 negative_prompt / seed / style / quality / size
 * 4. 负面词并入正向 prompt（官方建议写法）
 * 5. size 宽x高 → aspect_ratio + resolution 映射正确
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashScopeImageProvider } from '@core/platform/providers/image/dashscope-image.provider'
import { mapPixelsToKlingSize } from '@core/platform/providers/image/dashscope-image.provider'
import type { ImageGenerationRequest } from '@shared/types/image-provider.types'

function makeProvider(): DashScopeImageProvider {
  return new DashScopeImageProvider({
    id: 'test-dashscope',
    apiKey: 'test-key',
  })
}

function mockFetchCapture() {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ output: { task_id: 'task-1', task_status: 'PENDING' } }), { status: 200 })
  }))
  return calls
}

function baseRequest(over: Partial<ImageGenerationRequest> = {}): ImageGenerationRequest {
  return {
    model: 'kling/kling-v3-image-generation',
    prompt: 'portrait of a man',
    width: 768,
    height: 1024,
    ...over,
  }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('可灵路由与请求体', () => {
  it('kling 模型路由到 image-generation 端点并带异步头', async () => {
    const calls = mockFetchCapture()
    const provider = makeProvider()

    const r = await provider.generateImage(baseRequest())

    expect(r.success).toBe(true)
    expect(r.taskId).toBe('task-1')
    expect(calls[0].url).toContain('/api/v1/services/aigc/image-generation/generation')
    expect(calls[0].url).not.toContain('image-synthesis')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['X-DashScope-Async']).toBe('enable')
  })

  it('请求体只含官方支持参数（n/aspect_ratio/resolution/watermark），不发负面词/seed/style/quality/size', async () => {
    const calls = mockFetchCapture()
    const provider = makeProvider()

    await provider.generateImage(baseRequest({
      negativePrompt: 'blurry',
      seed: 42,
      quality: 'hd',
      style: 'anime',
    }))

    const body = JSON.parse(calls[0].init.body as string)
    expect(body.input.messages[0].content[0].text).toContain('portrait of a man')
    expect(body.parameters.n).toBe(1)
    expect(body.parameters.aspect_ratio).toBe('9:16')
    expect(body.parameters.resolution).toBe('1k')
    expect(body.parameters.watermark).toBe(false)
    // 官方不支持的参数一律不出现
    expect(body.parameters.size).toBeUndefined()
    expect(body.parameters.seed).toBeUndefined()
    expect(body.parameters.style).toBeUndefined()
    expect(body.parameters.quality).toBeUndefined()
    expect(body.input.negative_prompt).toBeUndefined()
    // 负面词并入正向 prompt
    expect(body.input.messages[0].content[0].text).toContain('blurry')
  })

  it('参考图放入 messages content 的 image 项', async () => {
    const calls = mockFetchCapture()
    const provider = makeProvider()

    await provider.generateImage(baseRequest({
      referenceImages: ['data:image/png;base64,AAA', 'data:image/png;base64,BBB'],
    }))

    const body = JSON.parse(calls[0].init.body as string)
    const images = body.input.messages[0].content.filter((c: { image?: string }) => c.image)
    expect(images.length).toBe(2)
    expect(images[0].image).toBe('data:image/png;base64,AAA')
  })
})

describe('mapPixelsToKlingSize', () => {
  it('竖版（3:4 / 2:3 / 9:16）→ 9:16', () => {
    expect(mapPixelsToKlingSize(768, 1024).aspectRatio).toBe('9:16')
    expect(mapPixelsToKlingSize(1024, 1536).aspectRatio).toBe('9:16')
    expect(mapPixelsToKlingSize(1024, 1792).aspectRatio).toBe('9:16')
  })

  it('方形 → 1:1', () => {
    expect(mapPixelsToKlingSize(1024, 1024).aspectRatio).toBe('1:1')
    expect(mapPixelsToKlingSize(512, 512).aspectRatio).toBe('1:1')
  })

  it('横版 → 16:9', () => {
    expect(mapPixelsToKlingSize(1920, 1080).aspectRatio).toBe('16:9')
    expect(mapPixelsToKlingSize(1536, 1024).aspectRatio).toBe('16:9')
  })

  it('分辨率：长边 ≥1792 → 2k，否则 1k', () => {
    expect(mapPixelsToKlingSize(768, 1024).resolution).toBe('1k')
    expect(mapPixelsToKlingSize(1024, 1024).resolution).toBe('1k')
    expect(mapPixelsToKlingSize(1024, 1792).resolution).toBe('2k')
    expect(mapPixelsToKlingSize(1080, 1920).resolution).toBe('2k')
    expect(mapPixelsToKlingSize(1920, 1080).resolution).toBe('2k')
  })
})
