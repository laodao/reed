/**
 * 火山/万相 adapter 修正 · 单元测试
 * @see src/core/image-providers/sdk/volcengine-image.provider.ts
 * @see src/core/image-providers/dashscope-image.provider.ts
 *
 * 验证目标（design image-provider-capability-model-design §5.2/§5.3）：
 * 火山：
 * 1. 显式 watermark: false（修复官方默认带水印问题）
 * 2. 停发官方参数表未列的 negative_prompt / style
 * 万相：
 * 3. multimodal 路径透传 promptExtend（缺省 true 保现状）
 * 4. promptExtend=false 时写入 prompt_extend: false（人像一致性场景）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VolcengineImageProvider } from '@core/image-providers/sdk/volcengine-image.provider'
import { DashScopeImageProvider } from '@core/image-providers/dashscope-image.provider'
import type { ImageGenerationRequest } from '@shared/types/image-provider.types'

function mockFetchCapture(payload: object) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(payload), { status: 200 })
  }))
  return calls
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('火山 adapter 修正', () => {
  function makeProvider() {
    return new VolcengineImageProvider({ id: 'v', apiKey: 'k' })
  }

  it('显式 watermark: false，停发 negative_prompt / style', async () => {
    const calls = mockFetchCapture({ data: [{ url: 'https://img/1.png' }] })
    const provider = makeProvider()

    await provider.generateImage({
      model: 'doubao-seedream-4-5-251128',
      prompt: 'a cat',
      width: 1024,
      height: 1024,
      negativePrompt: 'blurry',
      style: 'anime',
    } as ImageGenerationRequest)

    const body = JSON.parse(calls[0].init.body as string)
    expect(body.watermark).toBe(false)
    expect(body.negative_prompt).toBeUndefined()
    expect(body.style).toBeUndefined()
  })

  it('参考图仍正确走 body.image', async () => {
    const calls = mockFetchCapture({ data: [{ url: 'https://img/1.png' }] })
    const provider = makeProvider()

    await provider.generateImage({
      model: 'doubao-seedream-4-5-251128',
      prompt: 'a cat',
      width: 1024,
      height: 1024,
      referenceImages: ['data:image/png;base64,AAA'],
    } as ImageGenerationRequest)

    const body = JSON.parse(calls[0].init.body as string)
    expect(body.image).toBe('data:image/png;base64,AAA')
  })
})

describe('万相 promptExtend 透传', () => {
  function makeProvider() {
    return new DashScopeImageProvider({ id: 'd', apiKey: 'k' })
  }

  const multimodalPayload = {
    output: { choices: [{ message: { content: [{ image: 'https://img/1.png' }] } }] },
  }

  it('缺省不传 promptExtend 时行为保现状（prompt_extend: true）', async () => {
    const calls = mockFetchCapture(multimodalPayload)
    const provider = makeProvider()

    await provider.generateImage({
      model: 'qwen-image',
      prompt: 'a cat',
      width: 1024,
      height: 1024,
    } as ImageGenerationRequest)

    const body = JSON.parse(calls[0].init.body as string)
    expect(body.parameters.prompt_extend).toBe(true)
  })

  it('promptExtend=false 时写入 prompt_extend: false（人像一致性场景）', async () => {
    const calls = mockFetchCapture(multimodalPayload)
    const provider = makeProvider()

    await provider.generateImage({
      model: 'qwen-image',
      prompt: 'same person as reference',
      width: 1024,
      height: 1024,
      promptExtend: false,
    } as ImageGenerationRequest)

    const body = JSON.parse(calls[0].init.body as string)
    expect(body.parameters.prompt_extend).toBe(false)
  })
})
