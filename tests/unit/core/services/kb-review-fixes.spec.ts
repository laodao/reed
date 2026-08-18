/**
 * review 修复回归：H2 bailian rerank 请求形态 / H3 阈值语义（余弦阈值不被归一化破坏）
 * @module tests/core/kb-review-fixes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const kbRow: any = {
  id: 'kb1', name: '库', documentCount: 0, vectorCount: 0, totalSize: 0,
  embeddingConfig: null, rerankConfig: null,
}
const chunks: any = { findById: async (id: string) => ({ id, documentId: 'd1', content: `内容${id}` }) }
const docs: any = { findById: async () => ({ id: 'd1', name: '文档' }) }
const kbsRepo: any = { findById: async () => kbRow, updateStats: async () => {} }
const vectors: any = {
  searchSimilar: async (_kb: string, _v: number[], topK: number) =>
    [{ chunkId: 'c1', score: 0.3 }, { chunkId: 'c2', score: 0.28 }].slice(0, topK),
}
const providers: any = {
  getEnabled: async () => [],
  getById: async (id: string) =>
    id === 'pc-bailian'
      ? { id, templateId: 'bailian', apiKey: '' }
      : { id, templateId: 'generic', baseUrl: 'https://re.example.com/v1', apiKey: '' },
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

import { KnowledgeBaseService } from '@core/services/knowledge-base.service'
;(KnowledgeBaseService.prototype as any).getEmbeddingVectors = vi.fn(async (texts: string[]) => texts.map(() => [0.1]))

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => vi.unstubAllGlobals())

describe('H2：rerank 请求体按提供商形态分叉', () => {
  it('bailian → 嵌套 {model, input:{query,documents}, parameters}', async () => {
    kbRow.rerankConfig = JSON.stringify({ providerConfigId: 'pc-bailian', modelId: 'qwen3-rerank' })
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      output: { results: [{ index: 1, relevanceScore: 0.9 }, { index: 0, relevanceScore: 0.5 }] },
    }), { status: 200 }))
    const r = await new KnowledgeBaseService().search({ knowledgeBaseId: 'kb1', query: 'q', topK: 2 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ model: 'qwen3-rerank', input: { query: 'q' }, parameters: { top_n: 2 } })
    expect(body.documents).toBeUndefined() // 扁平形态不得出现在 bailian 分支
    expect(r.data![0].chunkId).toBe('c2') // bailian 响应形态 relevanceScore 生效
  })

  it('generic → 扁平 {model, query, documents, top_n}', async () => {
    kbRow.rerankConfig = JSON.stringify({ providerConfigId: 'pc-generic' })
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      results: [{ index: 0, relevance_score: 0.8 }],
    }), { status: 200 }))
    await new KnowledgeBaseService().search({ knowledgeBaseId: 'kb1', query: 'q', topK: 2 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ query: 'q', top_n: 2 })
    expect(Array.isArray(body.documents)).toBe(true)
  })
})

describe('H3：阈值作用于原始余弦（归一化不破坏既有语义）', () => {
  beforeEach(() => { kbRow.rerankConfig = null })

  it('threshold 高于全部余弦 → 空（top-1 不再因归一化恒 1.0 而误过）', async () => {
    const r = await new KnowledgeBaseService().search({ knowledgeBaseId: 'kb1', query: 'q', topK: 2, threshold: 0.5 })
    expect(r.data).toEqual([]) // 最高余弦 0.3 < 0.5
  })

  it('纯向量路径 score 保持原始余弦（非归一分）', async () => {
    const r = await new KnowledgeBaseService().search({ knowledgeBaseId: 'kb1', query: 'q', topK: 2 })
    expect(r.data![0].score).toBe(0.3)
    expect(r.data![0].chunkId).toBe('c1')
  })
})
