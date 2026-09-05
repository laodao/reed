/**
 * web-search 节点测试：引擎解析优先级（显式 engineType > 已配置引擎 configId > quick: 免Key > 默认配置）
 * @module tests/unit/core/platform/workflow/web-search-node
 * @description 覆盖「搜索引擎（可选）」配置驱动的解析链，保证吃瓜工作流等内置模板
 *              在未配置默认引擎时也能用免 Key 快速引擎（quick: 前缀）运行。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- mock 搜索服务（引擎解析核心依赖） ----
const searchMock = vi.fn()
const getConfigMock = vi.fn()
const getDefaultConfigMock = vi.fn()
vi.mock('@core/platform/services/search-engine.service', () => ({
  getSearchEngineService: () => ({
    search: (...a: any[]) => searchMock(...a),
    getConfig: (...a: any[]) => getConfigMock(...a),
    getDefaultConfig: (...a: any[]) => getDefaultConfigMock(...a),
  }),
}))

// ---- mock 其余重量级依赖（ai-nodes 静态 import 拉起） ----
vi.mock('@core/platform/services/knowledge-base.service', () => ({
  KnowledgeBaseService: class {
    search = vi.fn(async () => ({ success: true, data: [] }))
    searchQa = vi.fn(async () => ({ success: true, data: [] }))
    ingest = vi.fn(async () => ({ success: true, data: {} }))
    getDocuments = vi.fn(async () => ({ success: true, data: [] }))
  },
}))
vi.mock('@core/platform/services/translation.service', () => ({ TranslationService: { translateText: vi.fn() } }))
vi.mock('@core/platform/services/image.service', () => ({ ImageService: { generateImage: vi.fn() } }))
vi.mock('@core/platform/services/voice.service', () => ({ VoiceService: { synthesize: vi.fn() } }))
vi.mock('@core/platform/episode-production/reference-video/ffmpeg-helpers', () => ({
  getVideoMetadata: vi.fn(async () => ({ durationMs: 0 })),
  extractAudioSegment: vi.fn(),
}))
vi.mock('@core/interfaces/path.interface', () => ({ getPathProvider: () => ({ getDataPath: () => 'C:/t' }) }))
vi.mock('@core/interfaces/event.interface', () => ({ getEventEmitter: () => ({ emit: vi.fn() }) }))

import { AI_NODE_HANDLERS } from '@core/platform/workflow/nodes/ai-nodes'
import type { WorkflowNodeContext } from '@core/platform/workflow/engine/node-handler'

const handler = AI_NODE_HANDLERS.find(h => h.type === 'web-search')!

const makeCtx = (config: Record<string, unknown>): WorkflowNodeContext =>
  ({
    runId: 'run_1',
    runKey: 'nodeX',
    nodeId: 'nodeX',
    nodeType: 'web-search' as any,
    iterationIndex: 0,
    config,
    startInputs: {},
    triggerInfo: {},
    signal: new AbortController().signal,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    emitProgress: () => {},
    resolveTemplate: (t: string) => t as never,
    getVariable: () => undefined,
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
  searchMock.mockResolvedValue({ success: true, results: [{ title: 't', url: 'https://x', snippet: 's' }] })
  getConfigMock.mockResolvedValue(null)
  getDefaultConfigMock.mockResolvedValue(null)
})

describe('web-search 节点：搜索引擎解析', () => {
  it('给了已配置引擎 configId → 自动解析 engineType 并透传 configId', async () => {
    getConfigMock.mockResolvedValue({ id: 'sec_1', templateId: 'zhipu' })
    const r = await handler.execute(makeCtx({ query: '测试', searchConfigId: 'sec_1' }) as never)
    expect(r.status).toBe('succeeded')
    expect(searchMock).toHaveBeenCalledWith('测试', 'zhipu', 'sec_1', undefined)
  })

  it('quick: 前缀 → 免 Key 快速引擎，不查配置、不透传 configId', async () => {
    const r = await handler.execute(makeCtx({ query: '测试', searchConfigId: 'quick:baidu' }) as never)
    expect(r.status).toBe('succeeded')
    expect(getConfigMock).not.toHaveBeenCalled()
    expect(searchMock).toHaveBeenCalledWith('测试', 'baidu', undefined, undefined)
  })

  it('显式 engineType 优先于 searchConfigId', async () => {
    const r = await handler.execute(makeCtx({ query: '测试', engineType: 'bing-web', searchConfigId: 'sec_1' }) as never)
    expect(r.status).toBe('succeeded')
    expect(searchMock).toHaveBeenCalledWith('测试', 'bing-web', 'sec_1', undefined)
  })

  it('无 engineType/configId → 回退用户默认配置', async () => {
    getDefaultConfigMock.mockResolvedValue({ id: 'sec_def', templateId: 'bocha' })
    const r = await handler.execute(makeCtx({ query: '测试' }) as never)
    expect(r.status).toBe('succeeded')
    expect(searchMock).toHaveBeenCalledWith('测试', 'bocha', 'sec_def', undefined)
  })

  it('无任何引擎可用 → 明确报错（未配置搜索引擎）', async () => {
    const r = await handler.execute(makeCtx({ query: '测试' }) as never)
    expect(r.status).toBe('failed')
    expect((r as { error: string }).error).toContain('未配置搜索引擎')
  })

  it('搜索失败 → failed 并带原因（含 HTTP 状态）', async () => {
    searchMock.mockResolvedValue({ success: false, results: [], error: 'API 请求失败: HTTP 429' })
    const r = await handler.execute(makeCtx({ query: '测试', searchConfigId: 'quick:baidu' }) as never)
    expect(r.status).toBe('failed')
    expect((r as { error: string }).error).toContain('HTTP 429')
  })
})
