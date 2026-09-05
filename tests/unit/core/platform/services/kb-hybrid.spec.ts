/**
 * D3 混合检索权重测试：vectorWeight 两端行为 / 融合 / 降级
 * @module tests/core/kb-hybrid
 * @description mock 倒排索引 + 向量召回，验证 search 的加权融合语义。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const kbRow: any = {
  id: 'kb1', name: '库', documentCount: 0, vectorCount: 0, totalSize: 0,
  embeddingConfig: null, rerankConfig: null,
}
// 向量召回顺序（余弦）：c1 > c2 > c3
const vectors: any = {
  searchSimilar: async (_kb: string, _v: number[], topK: number) =>
    [{ chunkId: 'c1', score: 0.9 }, { chunkId: 'c2', score: 0.6 }, { chunkId: 'c3', score: 0.3 }].slice(0, topK),
}
// 倒排索引：关键词命中 c3（BM25 独占）
const inverted: any = {
  findByTerms: async () => new Map([['量子', [{ term: '量子', chunkId: 'c3', termFrequency: 5 }]]]),
  getDocumentFrequencies: async () => new Map([['量子', 1]]),
  getChunkCount: async () => 3,
  getAverageChunkLength: async () => 5,
}
const chunks: any = {
  findById: async (id: string) => ({ id, documentId: 'd1', content: `内容${id}` }),
}
const docs: any = { findById: async () => ({ id: 'd1', name: '文档' }) }
const kbsRepo: any = { findById: async () => kbRow, updateStats: async () => {} }

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    knowledgeBases: kbsRepo, kbChunks: chunks, kbDocuments: docs, kbVectors: vectors, kbInvertedIndex: inverted,
  }),
}))
vi.mock('@core/interfaces/event.interface', () => ({ getEventEmitter: () => ({ emit: () => {} }) }))

import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'

const embedMock = vi.fn(async (texts: string[]) => texts.map(() => [0.1]))
;(KnowledgeBaseService.prototype as any).getEmbeddingVectors = embedMock
const svc = new KnowledgeBaseService()
beforeEach(() => { embedMock.mockClear() })

describe('D3：混合检索权重', () => {
  it('缺省（不传）= 纯向量旧行为', async () => {
    const r = await svc.search({ knowledgeBaseId: 'kb1', query: '随便' })
    expect(r.data!.map(x => x.chunkId)).toEqual(['c1', 'c2', 'c3'])
    expect(embedMock).toHaveBeenCalled()
  })

  it('vectorWeight=1：纯向量（语义端）', async () => {
    const r = await svc.search({ knowledgeBaseId: 'kb1', query: '量子', vectorWeight: 1 })
    expect(r.data!.map(x => x.chunkId)).toEqual(['c1', 'c2', 'c3'])
  })

  it('vectorWeight=0：纯关键词（跳过嵌入调用）', async () => {
    const r = await svc.search({ knowledgeBaseId: 'kb1', query: '量子', vectorWeight: 0 })
    expect(r.data!.map(x => x.chunkId)).toEqual(['c3']) // 只有 BM25 命中
    expect(embedMock).not.toHaveBeenCalled() // 省一次嵌入 API
  })

  it('中间值融合：关键词命中的 c3 顶上来（0.5 时 c3 得分 0.5 > c2 的 0.33）', async () => {
    const r = await svc.search({ knowledgeBaseId: 'kb1', query: '量子', vectorWeight: 0.5 })
    expect(r.data![0].chunkId).toBe('c3') // 0.5*0 + 0.5*1 = 0.5
    expect(r.data![1].chunkId).toBe('c1') // 0.5*1 + 0 = 0.5（c1 向量归一 1）——与 c3 并列后次序稳定
    expect(r.data!.map(x => x.chunkId)).toContain('c2')
  })

  it('倒排索引缺失 → 降级纯向量不报错', async () => {
    const orig = inverted.findByTerms
    inverted.findByTerms = async () => new Map()
    try {
      const r = await svc.search({ knowledgeBaseId: 'kb1', query: '量子', vectorWeight: 0.5 })
      expect(r.success).toBe(true)
      expect(r.data!.map(x => x.chunkId)).toEqual(['c1', 'c2', 'c3'])
    } finally {
      inverted.findByTerms = orig
    }
  })
})
