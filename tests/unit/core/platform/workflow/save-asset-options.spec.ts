/**
 * save-asset 节点 enabled 开关 + groupName 测试
 * @module tests/unit/core/platform/workflow/save-asset-options
 * @description 验证：enabled=false 不落库（流程继续、输出 skipped 标记）；
 *              groupName 透传 AssetService.createAsset（mock 断言参数）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockCreateAsset = vi.fn()
const mockDeleteAsset = vi.fn()

vi.mock('@core/platform/assets/asset-registry', () => ({
  getAssetService: () => ({
    createAsset: mockCreateAsset,
    assetPreviewUrl: () => 'local-image://x.png',
    deleteAsset: mockDeleteAsset,
  }),
}))

import { ASSET_NODE_HANDLERS } from '@core/platform/workflow/nodes/asset-nodes'
import type { WorkflowNodeContext, WorkflowNodeHandler } from '@core/platform/workflow/engine/node-handler'

const saveAssetNode = ASSET_NODE_HANDLERS.find(n => n.type === 'save-asset') as WorkflowNodeHandler

function makeCtx(config: Record<string, unknown>): WorkflowNodeContext {
  return {
    config,
    runId: 'run_1',
    nodeId: 'save1',
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    emitProgress: vi.fn(),
  } as never as WorkflowNodeContext
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateAsset.mockResolvedValue({
    id: 'asset_1', name: 'x', category: 'image', subCategory: '电商套图', kind: 'file', groupId: 'ag_1',
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('save-asset 节点选项', () => {
  it('enabled=false：不调 createAsset，输出 skipped 标记', async () => {
    const ctx = makeCtx({ content: 'C:/img.png', kind: 'file', enabled: false })
    const result = await saveAssetNode.execute(ctx)
    expect(result.status).toBe('succeeded')
    expect(mockCreateAsset).not.toHaveBeenCalled()
    expect((result as { output: Record<string, unknown> }).output.skipped).toBe(true)
    expect((result as { output: Record<string, unknown> }).output.assetId).toBe('')
  })

  it('enabled 缺省（undefined）：正常保存', async () => {
    const ctx = makeCtx({ content: 'C:/img.png', kind: 'file' })
    const result = await saveAssetNode.execute(ctx)
    expect(result.status).toBe('succeeded')
    expect(mockCreateAsset).toHaveBeenCalled()
    expect((result as { output: Record<string, unknown> }).output.assetId).toBe('asset_1')
  })

  it('groupName 透传 createAsset', async () => {
    const ctx = makeCtx({ content: 'C:/img.png', kind: 'file', groupName: '套图A' })
    await saveAssetNode.execute(ctx)
    expect(mockCreateAsset).toHaveBeenCalledWith(
      expect.objectContaining({ groupName: '套图A', sourceRef: 'run_1' })
    )
  })

  it('无 groupName：不传该字段', async () => {
    const ctx = makeCtx({ content: 'C:/img.png', kind: 'file' })
    await saveAssetNode.execute(ctx)
    expect(mockCreateAsset).toHaveBeenCalledWith(
      expect.not.objectContaining({ groupName: expect.anything() })
    )
  })

  it('passthrough：透传字段合并进输出（确认环节取 prompt/seed 用）', async () => {
    const ctx = makeCtx({
      content: 'C:/img.png', kind: 'file',
      passthrough: { prompt: 'P1', seed: 42, negativePrompt: 'N1' },
    })
    const result = await saveAssetNode.execute(ctx)
    expect(result.status).toBe('succeeded')
    const out = (result as { output: Record<string, unknown> }).output
    expect(out.prompt).toBe('P1')
    expect(out.seed).toBe(42)
    expect(out.negativePrompt).toBe('N1')
    expect(out.assetId).toBe('asset_1')
  })

  it('passthrough 缺省：不产生多余字段', async () => {
    const ctx = makeCtx({ content: 'C:/img.png', kind: 'file' })
    const result = await saveAssetNode.execute(ctx)
    const out = (result as { output: Record<string, unknown> }).output
    expect(out.prompt).toBeUndefined()
  })

  it('replaceAssetId：保存新资产后删除旧资产（重生成替换语义）', async () => {
    mockDeleteAsset.mockResolvedValue(true)
    const ctx = makeCtx({ content: 'C:/img.png', kind: 'file', replaceAssetId: 'old_1' })
    const result = await saveAssetNode.execute(ctx)
    expect(result.status).toBe('succeeded')
    expect(mockDeleteAsset).toHaveBeenCalledWith('old_1')
    // 新资产 id 输出
    expect((result as { output: Record<string, unknown> }).output.assetId).toBe('asset_1')
  })

  it('replaceAssetId 缺省：不删除任何资产', async () => {
    const ctx = makeCtx({ content: 'C:/img.png', kind: 'file' })
    await saveAssetNode.execute(ctx)
    expect(mockDeleteAsset).not.toHaveBeenCalled()
  })
})
