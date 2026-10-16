/**
 * D2 rerank 测试：search 重排 / 失败降级 / useRerank 关闭 / 模型列表
 * @module tests/core/kb-rerank
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const kbRow: any = {
  id: 'kb1', name: '库', documentCount: 0, vectorCount: 0, totalSize: 0,
  embeddingConfig: null, rerankConfig: null,
}
const chunks: any = {
  findById: async (id: string) => ({ id, documentId: 'd1', content: `内容${id}` }),
}
const docs: any = { findById: async () => ({ id: 'd1', name: '文档' }) }
const kbsRepo: any = {
  findById: async () => kbRow,
  updateStats: async () => {},
}
const vectors: any = {
  searchSimilar: async (_kb: string, _v: number[], topK: number) =>
    ['c3', 'c1', 'c2'].slice(0, topK).map(chunkId => ({ chunkId, score: 0.5 })),
}
const providers: any = {
  getEnabled: async () => [{ id: 'pc1', name: 'P1', templateId: 'generic', baseUrl: 'https://re.example.com/v1', models: [{ id: 'm-rerank', name: 'R', type: 'rerank' }] }],
  getById: async () => ({ id: 'pc1', templateId: 'generic', baseUrl: 'https://re.example.com/v1', apiKey: '' }),
}

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    knowledgeBases: kbsRepo, kbChunks: chunks, kbDocuments: docs, kbVectors: vectors, providerConfigs: providers,
  }),
}))
vi.mock('@core/interfaces/event.interface', () => ({ getEventEmitter: () => ({ emit: () => {} }) }))
vi.mock('@core/interfaces/storage.interface', () => ({
  getSecureStorage: () => ({ isInitialized: () => true, initialize: async () => {}, decrypt: () => 'sk' }),
}))

import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'

;(KnowledgeBaseService.prototype as any).getEmbeddingVectors = vi.fn(async (texts: string[]) => texts.map(() => [0.1]))

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => vi.unstubAllGlobals())

describe('D2：search 接入 rerank', () => {
  it('配置 rerank 后按相关度重排（score 采用 rerank 分数）', async () => {
    kbRow.rerankConfig = JSON.stringify({ providerConfigId: 'pc1', modelId: 'gte-rerank' })
    // rerank 响应把顺序倒过来：c2 > c1 > c3
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      results: [
        { index: 2, relevance_score: 0.9 },
        { index: 1, relevance_score: 0.7 },
        { index: 0, relevance_score: 0.1 },
      ],
    }), { status: 200 }))
    const r = await new KnowledgeBaseService().search({ knowledgeBaseId: 'kb1', query: 'q', topK: 3 })
    expect(r.success).toBe(true)
    expect(r.data!.map(x => x.chunkId)).toEqual(['c2', 'c1', 'c3'])
    expect(r.data![0].score).toBe(0.9)
    // 请求体形态
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.model).toBe('gte-rerank')
    expect(body.documents).toHaveLength(3)
    expect(body.query).toBe('q')
  })

  it('rerank API 失败 → 降级原序不阻断', async () => {
    kbRow.rerankConfig = JSON.stringify({ providerConfigId: 'pc1' })
    fetchMock.mockResolvedValue(new Response('{"message":"boom"}', { status: 500 }))
    const r = await new KnowledgeBaseService().search({ knowledgeBaseId: 'kb1', query: 'q', topK: 3 })
    expect(r.success).toBe(true)
    expect(r.data!.map(x => x.chunkId)).toEqual(['c3', 'c1', 'c2']) // 原序
  })

  it('useRerank:false 强制关闭（不调 rerank API）', async () => {
    kbRow.rerankConfig = JSON.stringify({ providerConfigId: 'pc1' })
    const r = await new KnowledgeBaseService().search({ knowledgeBaseId: 'kb1', query: 'q', topK: 3, useRerank: false })
    expect(r.success).toBe(true)
    expect(r.data!.map(x => x.chunkId)).toEqual(['c3', 'c1', 'c2'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('未配置 rerank_config → 不调 API', async () => {
    kbRow.rerankConfig = null
    await new KnowledgeBaseService().search({ knowledgeBaseId: 'kb1', query: 'q', topK: 3 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('D2：getRerankModels', () => {
  it('列出 rerank 类型模型（含提供商信息）', async () => {
    kbRow.rerankConfig = null
    const r = await new KnowledgeBaseService().getRerankModels()
    expect(r.success).toBe(true)
    expect(r.data).toHaveLength(1)
    expect(r.data![0]).toMatchObject({ id: 'm-rerank', name: 'P1 - R', providerConfigId: 'pc1' })
  })
})
