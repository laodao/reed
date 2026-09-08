/**
 * read-asset 节点单测：url/path/content/metadata 输出；description/tags/subCategory 始终带出
 * @module tests/unit/core/platform/workflow/read-asset
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAsset = vi.fn()

vi.mock('@core/platform/assets/asset-registry', () => ({
  getAssetService: () => ({
    getAsset: mockGetAsset,
    assetPreviewUrl: () => 'local-image://assets/image/202609/x.png',
    resolveAssetPath: () => 'C:/the-bot/assets/image/202609/x.png',
  }),
}))

import { ASSET_NODE_HANDLERS } from '@core/platform/workflow/nodes/asset-nodes'
import type { WorkflowNodeContext, WorkflowNodeHandler } from '@core/platform/workflow/engine/node-handler'

const readAssetNode = ASSET_NODE_HANDLERS.find(n => n.type === 'read-asset') as WorkflowNodeHandler

function makeCtx(config: Record<string, unknown>): WorkflowNodeContext {
  return { config, runId: 'run_1', nodeId: 'read1' } as never as WorkflowNodeContext
}

const RECORD = {
  id: 'asset_1',
  name: '星宇脚本',
  category: 'text',
  subCategory: '短视频脚本',
  kind: 'text',
  tags: ['吃瓜', '星宇股份'],
  description: '星宇股份短视频脚本 2026-09-04',
  textContent: '## 脚本概览\n正文…',
  sizeBytes: 7591,
  mimeType: 'text/plain',
  createdAt: '2026-09-04T14:02:41.207Z',
  metadata: { runId: 'wfrun_1' },
  sourceRef: 'wfrun_1',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAsset.mockResolvedValue(RECORD)
})

describe('read-asset 节点输出', () => {
  it('任意模式均带出 subCategory/tags/description（供 LLM 素材匹配）', async () => {
    const result = (await readAssetNode.execute(makeCtx({ assetId: 'asset_1', output: 'content' }))) as {
      status: string
      output: Record<string, unknown>
    }
    expect(result.status).toBe('succeeded')
    expect(result.output).toMatchObject({
      subCategory: '短视频脚本',
      tags: ['吃瓜', '星宇股份'],
      description: '星宇股份短视频脚本 2026-09-04',
      content: '## 脚本概览\n正文…',
    })
  })

  it('path 模式返回本地路径；metadata 模式含 sizeBytes/mimeType/sourceRef/metadata', async () => {
    const p = (await readAssetNode.execute(makeCtx({ assetId: 'asset_1', output: 'path' }))) as {
      output: Record<string, unknown>
    }
    expect(p.output.path).toBe('C:/the-bot/assets/image/202609/x.png')

    const m = (await readAssetNode.execute(makeCtx({ assetId: 'asset_1', output: 'metadata' }))) as {
      output: Record<string, unknown>
    }
    expect(m.output).toMatchObject({
      sizeBytes: 7591,
      mimeType: 'text/plain',
      sourceRef: 'wfrun_1',
      metadata: { runId: 'wfrun_1' },
    })
  })

  it('资产不存在 → failed', async () => {
    mockGetAsset.mockResolvedValue(null)
    const result = await readAssetNode.execute(makeCtx({ assetId: 'missing' }))
    expect(result.status).toBe('failed')
  })
})
