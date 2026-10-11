/**
 * save-asset 节点 dedupeUrl（URL 幂等）+ sourceRef（跨运行归组）测试
 * @module tests/unit/core/platform/workflow/save-asset-dedupe
 * @description 采集类工作流重跑/增量不产生重复资产、跨运行同名组并集：
 *              - dedupeUrl 命中已有资产 → 不调 createAsset，输出已有 assetId + deduped=true
 *              - dedupeUrl 未命中 → createAsset 收到 url（落 url 列，供后续查重）
 *              - sourceRef 可配稳定值（缺省仍为 runId）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateAsset = vi.fn()
const mockFindAssetByUrl = vi.fn()

vi.mock('@core/platform/assets/asset-registry', () => ({
  getAssetService: () => ({
    createAsset: mockCreateAsset,
    findAssetByUrl: mockFindAssetByUrl,
    assetPreviewUrl: () => 'local-file://x.md',
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
  mockFindAssetByUrl.mockResolvedValue(null)
  mockCreateAsset.mockResolvedValue({
    id: 'asset_new', name: 'n', category: 'document', subCategory: '博主文章', kind: 'text', groupId: 'group_1',
  })
})

describe('save-asset dedupeUrl（URL 幂等去重）', () => {
  it('已存在同链接资产 → 不重复保存，输出已有 assetId + deduped=true', async () => {
    mockFindAssetByUrl.mockResolvedValue({ id: 'asset_old', name: '旧文', kind: 'text', groupId: 'g0' })
    const result = await saveAssetNode.execute(makeCtx({
      content: '正文', kind: 'text', dedupeUrl: 'https://www.toutiao.com/article/1/',
    }))
    expect(result.status).toBe('succeeded')
    expect(mockCreateAsset).not.toHaveBeenCalled()
    const out = (result as { output: Record<string, unknown> }).output
    expect(out.assetId).toBe('asset_old')
    expect(out.deduped).toBe(true)
  })

  it('未命中 → 正常保存，createAsset 带 url（落 url 列）与 sourceType=workflow', async () => {
    const result = await saveAssetNode.execute(makeCtx({
      content: '正文', kind: 'text', dedupeUrl: 'https://www.toutiao.com/article/1/',
    }))
    expect(result.status).toBe('succeeded')
    expect(mockFindAssetByUrl).toHaveBeenCalledWith('https://www.toutiao.com/article/1/')
    expect(mockCreateAsset).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://www.toutiao.com/article/1/',
      sourceType: 'workflow',
    }))
    const out = (result as { output: Record<string, unknown> }).output
    expect(out.assetId).toBe('asset_new')
    expect(out.deduped).toBeUndefined()
  })

  it('未配置 dedupeUrl → 不触发查重（旧行为不变）', async () => {
    await saveAssetNode.execute(makeCtx({ content: '正文', kind: 'text' }))
    expect(mockFindAssetByUrl).not.toHaveBeenCalled()
  })

  it('enabled=false 优先：不查重不保存', async () => {
    const result = await saveAssetNode.execute(makeCtx({
      content: '正文', kind: 'text', enabled: false, dedupeUrl: 'https://x/',
    }))
    expect(mockFindAssetByUrl).not.toHaveBeenCalled()
    expect((result as { output: Record<string, unknown> }).output.skipped).toBe(true)
  })
})

describe('save-asset sourceRef（跨运行归组）', () => {
  it('可配稳定 sourceRef（多次运行同名组并入同一集合）', async () => {
    await saveAssetNode.execute(makeCtx({
      content: '正文', kind: 'text', groupName: '博主A',
      sourceRef: 'toutiao-blogger:https://www.toutiao.com/c/user/token/x/',
    }))
    expect(mockCreateAsset).toHaveBeenCalledWith(expect.objectContaining({
      groupName: '博主A',
      sourceRef: 'toutiao-blogger:https://www.toutiao.com/c/user/token/x/',
    }))
  })

  it('缺省 sourceRef 仍为当前运行 id（套图等既有语义不变）', async () => {
    await saveAssetNode.execute(makeCtx({ content: 'C:/img.png', kind: 'file', groupName: '套图A' }))
    expect(mockCreateAsset).toHaveBeenCalledWith(expect.objectContaining({ sourceRef: 'run_1' }))
  })
})
