/**
 * image-gen 参考图支持测试（电商海报场景）
 * @module tests/unit/core/modules/workflow/image-gen-reference.spec
 * @description 验证：config 增加 referenceImages（文件路径数组）后，handler 读取
 *              文件转 base64 data URL 并透传 ImageService.generateImage；缺省不传；
 *              文件不存在报错。mock ImageService 验证透传参数。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 真实临时文件（作为参考图输入）
let refPath = ''
let refPath2 = ''

vi.mock('@core/services/image.service', () => ({
  ImageService: {
    generateImage: vi.fn().mockResolvedValue({
      success: true,
      images: [{ url: 'http://img/x.png', width: 1024, height: 1024 }],
    }),
  },
}))

import { ImageService } from '@core/services/image.service'
import { AI_NODE_HANDLERS } from '@core/modules/workflow/nodes/ai-nodes'
import type { WorkflowNodeContext, WorkflowNodeHandler } from '@core/modules/workflow/engine/node-handler'

const imageGenNode = AI_NODE_HANDLERS.find(n => n.type === 'image-gen') as WorkflowNodeHandler

function makeCtx(config: Record<string, unknown>): WorkflowNodeContext {
  return {
    config,
    runId: 'run_1',
    nodeId: 'img1',
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    emitProgress: vi.fn(),
  } as never as WorkflowNodeContext
}

beforeAll(() => {
  refPath = join(tmpdir(), 'wf-ref-1.png')
  refPath2 = join(tmpdir(), 'wf-ref-2.png')
  require('node:fs').writeFileSync(refPath, 'PNG-DATA-1')
  require('node:fs').writeFileSync(refPath2, 'PNG-DATA-2')
})

afterAll(() => {
  try { require('node:fs').unlinkSync(refPath) } catch { /* ignore */ }
  try { require('node:fs').unlinkSync(refPath2) } catch { /* ignore */ }
})

beforeEach(() => {
  vi.clearAllMocks()
  ;(ImageService.generateImage as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true,
    images: [{ url: 'http://img/x.png', width: 1024, height: 1024 }],
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('image-gen 参考图', () => {
  it('无 referenceImages 时正常调用（不传该字段）', async () => {
    const ctx = makeCtx({ prompt: '一只猫', modelId: 'm1' })
    const result = await imageGenNode.execute(ctx)
    expect(result.status).toBe('succeeded')
    const call = (ImageService.generateImage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.referenceImages).toBeUndefined()
  })

  it('referenceImages 文件路径 → base64 data URL 透传', async () => {
    const ctx = makeCtx({ prompt: '海报', modelId: 'm1', referenceImages: [refPath, refPath2] })
    const result = await imageGenNode.execute(ctx)
    expect(result.status).toBe('succeeded')
    const call = (ImageService.generateImage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(Array.isArray(call.referenceImages)).toBe(true)
    expect(call.referenceImages.length).toBe(2)
    expect(call.referenceImages[0]).toMatch(/^data:image\/png;base64,/)
    expect(call.referenceImages[0]).toContain(Buffer.from('PNG-DATA-1').toString('base64'))
  })

  it('referenceImages 引用不存在的文件 → 节点 failed 且错误信息明确', async () => {
    const ctx = makeCtx({ prompt: '海报', modelId: 'm1', referenceImages: ['C:/no/such/file.png'] })
    const result = await imageGenNode.execute(ctx)
    expect(result.status).toBe('failed')
    expect((result as { error?: string }).error).toContain('参考图')
  })
})
