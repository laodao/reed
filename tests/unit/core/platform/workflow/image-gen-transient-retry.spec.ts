/**
 * image-gen 提交瞬时失败内部重试测试（评审 #105 补 B 的图像侧）
 * @module tests/unit/core/platform/workflow/image-gen-transient-retry.spec
 * @description 验证：generateImage 提交返回瞬时性错误（fetch/网络/网关 5xx/超时）
 *              时节点内部等待后重试一次（与 video-gen 共用 retry-submit）；非瞬时
 *              失败不重试；首调成功不重试（回归）。用 fake timers 推进重试等待，
 *              测试不真等 3 秒。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { tmpdir } from 'node:os'

vi.mock('@core/platform/services/image.service', () => ({
  ImageService: {
    generateImage: vi.fn().mockResolvedValue({
      success: true,
      images: [{ url: 'http://img/x.png', width: 1024, height: 1024 }],
    }),
  },
}))

import { ImageService } from '@core/platform/services/image.service'
import { AI_NODE_HANDLERS } from '@core/platform/workflow/nodes/ai-nodes'
import type { WorkflowNodeContext, WorkflowNodeHandler } from '@core/platform/workflow/engine/node-handler'
import { registerPathProvider } from '@core/interfaces/path.interface'

const imageGenNode = AI_NODE_HANDLERS.find(n => n.type === 'image-gen') as WorkflowNodeHandler

const generateImageMock = ImageService.generateImage as unknown as ReturnType<typeof vi.fn>

function makeCtx(config: Record<string, unknown>): WorkflowNodeContext {
  return {
    config,
    runId: 'run_1',
    nodeId: 'img1',
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    emitProgress: vi.fn(),
  } as never as WorkflowNodeContext
}

function loggerOf(ctx: WorkflowNodeContext): { warn: ReturnType<typeof vi.fn> } {
  return ctx.logger as unknown as { warn: ReturnType<typeof vi.fn> }
}

/** 用 fake timers 即时推进执行期间排定的重试等待（不真等 3 秒） */
async function runWithInstantRetryWait<T>(run: () => Promise<T>): Promise<T> {
  vi.useFakeTimers()
  try {
    let error: unknown
    let out!: T
    const pending = run().then(
      r => { out = r },
      e => { error = e }
    )
    // 一次性走完 execute 期间排定的全部 setTimeout（每次瞬时重试等待 3 秒）
    await vi.runAllTimersAsync()
    await pending
    if (error !== undefined) throw error
    return out
  } finally {
    vi.useRealTimers()
  }
}

beforeAll(() => {
  // PathProvider（image-gen handler 解析 filePath 用）
  registerPathProvider(() => ({
    getDataPath: () => tmpdir(),
    getUserDataPath: () => tmpdir(),
    getAppDataPath: () => tmpdir(),
    getTempPath: () => tmpdir(),
    getSubDirectories: () => ({}) as never,
    getSubDirectoryPath: () => tmpdir(),
    toAssetUrl: (p: string) => 'local-image://' + p.replace(/\\/g, '/').replace(/^\/+/, ''),
  }))
})

afterAll(() => {
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.clearAllMocks()
  generateImageMock.mockResolvedValue({
    success: true,
    images: [{ url: 'http://img/x.png', width: 1024, height: 1024 }],
  })
})

describe('image-gen 提交瞬时失败内部重试', () => {
  it('首调成功 → 只调用一次，不重试（回归）', async () => {
    const ctx = makeCtx({ prompt: '一只猫', modelId: 'm1' })
    const result = await imageGenNode.execute(ctx)
    expect(result.status).toBe('succeeded')
    expect(generateImageMock).toHaveBeenCalledTimes(1)
    expect(loggerOf(ctx).warn).not.toHaveBeenCalled()
  })

  it('瞬时失败（fetch failed）→ 等待后重试一次成功 → succeeded', async () => {
    generateImageMock
      .mockResolvedValueOnce({ success: false, error: 'fetch failed' })
      .mockResolvedValueOnce({
        success: true,
        images: [{ url: 'http://img/x.png', width: 1024, height: 1024 }],
      })
    const ctx = makeCtx({ prompt: '海报', modelId: 'm1' })
    const result = await runWithInstantRetryWait(() => imageGenNode.execute(ctx))
    expect(result.status).toBe('succeeded')
    expect(generateImageMock).toHaveBeenCalledTimes(2)
    expect(loggerOf(ctx).warn).toHaveBeenCalledTimes(1)
  })

  it('网关 5xx（中文瞬时错误）→ 重试成功', async () => {
    generateImageMock
      .mockResolvedValueOnce({ success: false, error: '网关返回 HTTP 502: <html>bad gateway</html>' })
      .mockResolvedValueOnce({
        success: true,
        images: [{ url: 'http://img/y.png', width: 1024, height: 1024 }],
      })
    const ctx = makeCtx({ prompt: '海报', modelId: 'm1' })
    const result = await runWithInstantRetryWait(() => imageGenNode.execute(ctx))
    expect(result.status).toBe('succeeded')
    expect(generateImageMock).toHaveBeenCalledTimes(2)
  })

  it('瞬时失败且重试仍失败 → 共两次调用，节点 failed 且错误明确', async () => {
    generateImageMock.mockResolvedValue({ success: false, error: 'fetch failed' })
    const ctx = makeCtx({ prompt: '海报', modelId: 'm1' })
    const result = await runWithInstantRetryWait(() => imageGenNode.execute(ctx))
    expect(result.status).toBe('failed')
    expect(generateImageMock).toHaveBeenCalledTimes(2)
    expect((result as { error?: string }).error).toContain('图像生成失败')
  })

  it('非瞬时失败（配置/模型类错误）→ 不重试，直接 failed', async () => {
    generateImageMock.mockResolvedValue({ success: false, error: '模型未登记生成能力: m1' })
    const ctx = makeCtx({ prompt: '海报', modelId: 'm1' })
    const result = await imageGenNode.execute(ctx)
    expect(result.status).toBe('failed')
    expect(generateImageMock).toHaveBeenCalledTimes(1)
    expect(loggerOf(ctx).warn).not.toHaveBeenCalled()
  })

  it('重试时透传与首调一致的请求参数', async () => {
    generateImageMock
      .mockResolvedValueOnce({ success: false, error: 'ECONNREFUSED' })
      .mockResolvedValueOnce({
        success: true,
        images: [{ url: 'http://img/z.png', width: 512, height: 512 }],
      })
    const ctx = makeCtx({ prompt: '猫', modelId: 'm1', width: 512, height: 512, seed: 42 })
    const result = await runWithInstantRetryWait(() => imageGenNode.execute(ctx))
    expect(result.status).toBe('succeeded')
    const [first, second] = generateImageMock.mock.calls
    expect(second[0].prompt).toBe(first[0].prompt)
    expect(second[0].modelId).toBe(first[0].modelId)
    expect(second[0].seed).toBe(42)
  })
})
