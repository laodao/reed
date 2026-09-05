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
import { VolcengineImageProvider } from '@core/platform/providers/image/sdk/volcengine-image.provider'
import { DashScopeImageProvider } from '@core/platform/providers/image/dashscope-image.provider'
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

  // 注：wan2.6-image 在 generateImage 分发中不匹配任何已知格式，
  // 实际走"未知模型 → multimodal 兜底"路径（该路径 Task 3 已传 prompt_extend），
  // 下面两例锁定该行为不回退
  it('wan2.6-image（multimodal 兜底路径）：promptExtend=false 生效（plan A0-1）', async () => {
    const calls = mockFetchCapture({ output: { task_id: 't1', task_status: 'PENDING' } })
    const provider = makeProvider()

    await provider.generateImage({
      model: 'wan2.6-image',
      prompt: 'same person as reference',
      width: 768,
      height: 1024,
      promptExtend: false,
    } as ImageGenerationRequest)

    const body = JSON.parse(calls[0].init.body as string)
    expect(body.parameters.prompt_extend).toBe(false)
  })

  it('wan2.6-image（multimodal 兜底路径）：缺省为 true（保现状）', async () => {
    const calls = mockFetchCapture({ output: { task_id: 't1', task_status: 'PENDING' } })
    const provider = makeProvider()

    await provider.generateImage({
      model: 'wan2.6-image',
      prompt: 'a cat',
      width: 768,
      height: 1024,
    } as ImageGenerationRequest)

    const body = JSON.parse(calls[0].init.body as string)
    expect(body.parameters.prompt_extend).toBe(true)
  })

  it('wanx-v1（native 路径）：promptExtend=false 生效（plan A0-1 补齐）', async () => {
    const calls = mockFetchCapture({ output: { task_id: 't1', task_status: 'PENDING' } })
    const provider = makeProvider()

    await provider.generateImage({
      model: 'wanx-v1',
      prompt: 'same person as reference',
      width: 768,
      height: 1024,
      promptExtend: false,
    } as ImageGenerationRequest)

    const body = JSON.parse(calls[0].init.body as string)
    expect(body.parameters.prompt_extend).toBe(false)
  })
})

describe('normalizeSeedreamSize（Seedream 最小像素约束）', () => {
  it('768×1024 低于下限 → 按比例放大到 ≥3686400 且保持 3:4', async () => {
    const { normalizeSeedreamSize } = await import('@core/platform/providers/image/sdk/volcengine-image.provider')
    const r = normalizeSeedreamSize(768, 1024)
    expect(r.width * r.height).toBeGreaterThanOrEqual(3686400)
    expect(Math.abs(r.width / r.height - 768 / 1024)).toBeLessThan(0.01)
    expect(r.width % 2).toBe(0)
    expect(r.height % 2).toBe(0)
  })

  it('1024×1792 低于下限 → 放大保持 4:7', async () => {
    const { normalizeSeedreamSize } = await import('@core/platform/providers/image/sdk/volcengine-image.provider')
    const r = normalizeSeedreamSize(1024, 1792)
    expect(r.width * r.height).toBeGreaterThanOrEqual(3686400)
    expect(Math.abs(r.width / r.height - 1024 / 1792)).toBeLessThan(0.01)
  })

  it('2048×2048 已达标 → 不变', async () => {
    const { normalizeSeedreamSize } = await import('@core/platform/providers/image/sdk/volcengine-image.provider')
    const r = normalizeSeedreamSize(2048, 2048)
    expect(r.width).toBe(2048)
    expect(r.height).toBe(2048)
  })

  it('超过 4096 边长 → 按比例缩小到 4096', async () => {
    const { normalizeSeedreamSize } = await import('@core/platform/providers/image/sdk/volcengine-image.provider')
    const r = normalizeSeedreamSize(5000, 5000)
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(4096)
  })
})
