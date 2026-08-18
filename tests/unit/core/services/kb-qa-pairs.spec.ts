/**
 * D1 QA 知识库测试：问答对 CRUD 向量化 / 双路径检索 / xlsx 导入导出
 * @module tests/core/kb-qa-pairs
 * @description mock 数据库管理器与嵌入调用，验证服务层语义。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- 假数据库（内存） ----
class MemQaPairs {
  rows: Map<string, any> = new Map()
  seq = 0
  async listByKnowledgeBaseId(kbId: string, kw?: string) {
    return [...this.rows.values()].filter(r => r.knowledgeBaseId === kbId &&
      (!kw || r.question.includes(kw) || r.answer.includes(kw)))
  }
  async findById(id: string) { return this.rows.get(id) ?? null }
  async create(i: any) {
    const id = `qa${++this.seq}`
    const row = { id, createdAt: new Date(), updatedAt: new Date(), ...i }
    this.rows.set(id, row)
    return row
  }
  async update(id: string, patch: any) {
    const row = this.rows.get(id)
    if (!row) return null
    Object.assign(row, patch, { updatedAt: new Date() })
    return { ...row }
  }
  async delete(id: string) { return this.rows.delete(id) ? 1 : 0 }
  async deleteByKnowledgeBaseId(kbId: string) {
    let n = 0
    for (const [k, v] of this.rows) if (v.knowledgeBaseId === kbId) { this.rows.delete(k); n++ }
    return n
  }
  async countByKnowledgeBaseId(kbId: string) {
    return [...this.rows.values()].filter(r => r.knowledgeBaseId === kbId).length
  }
}
class MemKbs {
  row: any = { id: 'kb1', name: '测试库', documentCount: 0, vectorCount: 0, totalSize: 0, embeddingConfig: null }
  statsCalls: any[] = []
  async findById() { return this.row }
  async updateStats(_id: string, stats: any) { this.statsCalls.push(stats); Object.assign(this.row, stats) }
}
class MemVectors {
  inserted: Array<{ chunkId: string; knowledgeBaseId: string; vector: number[] }> = []
  deleted: string[] = []
  async createBatch(items: any[]) { this.inserted.push(...items); return items }
  async deleteByChunkId(chunkId: string) { this.deleted.push(chunkId) }
  async searchSimilar(kbId: string, _v: number[], topK: number) {
    return this.inserted
      .filter(x => x.knowledgeBaseId === kbId)
      .slice(0, topK)
      .map(x => ({ chunkId: x.chunkId, score: 0.9 }))
  }
}

const qa = new MemQaPairs()
const kbs = new MemKbs()
const vectors = new MemVectors()

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    knowledgeBases: kbs,
    kbQaPairs: qa,
    kbVectors: vectors,
  }),
}))
vi.mock('@core/interfaces/event.interface', () => ({ getEventEmitter: () => ({ emit: () => {} }) }))

import { KnowledgeBaseService } from '@core/services/knowledge-base.service'

// 嵌入 mock：单向量恒等（长度按文本长度，便于断言批次数）
const embedMock = vi.fn(async (texts: string[]) => texts.map(t => [t.length]))
;(KnowledgeBaseService.prototype as any).getEmbeddingVectors = embedMock

const svc = new KnowledgeBaseService()
beforeEach(() => {
  qa.rows.clear(); vectors.inserted = []; vectors.deleted = []; kbs.statsCalls = []
  kbs.row = { id: 'kb1', name: '测试库', documentCount: 0, vectorCount: 0, totalSize: 0, embeddingConfig: null }
  embedMock.mockClear()
})

describe('D1：QA 对 CRUD 与向量化', () => {
  it('addQaPair：question+相似问题全部向量化（qa: 命名空间）并更新统计', async () => {
    const r = await svc.addQaPair('kb1', { question: '退货政策？', answer: '7 天无理由', similarQuestions: ['怎么退货', '退款流程'] })
    expect(r.success).toBe(true)
    expect(vectors.inserted).toHaveLength(3)
    expect(vectors.inserted[0].chunkId).toMatch(/^qa:\w+:0$/)
    expect(vectors.inserted[2].chunkId).toMatch(/^qa:\w+:2$/)
    expect(kbs.row.vectorCount).toBe(3)
  })

  it('addQaPair：空问题/空答案拒绝', async () => {
    expect((await svc.addQaPair('kb1', { question: ' ', answer: 'x' })).success).toBe(false)
    expect((await svc.addQaPair('kb1', { question: 'q', answer: '' })).success).toBe(false)
  })

  it('updateQaPair：删旧变体向量并重建', async () => {
    const r = await svc.addQaPair('kb1', { question: 'q1', answer: 'a1', similarQuestions: ['s1'] })
    const pairId = r.data!.id
    await svc.updateQaPair(pairId, { question: 'q1-new', answer: 'a1', similarQuestions: [] })
    // 旧 2 条删除，新 1 条写入
    expect(vectors.deleted).toHaveLength(2)
    expect(vectors.inserted.at(-1)!.chunkId).toBe(`qa:${pairId}:0`)
    expect((await qa.findById(pairId)).question).toBe('q1-new')
  })

  it('deleteQaPair：向量与行一并删除（幂等）', async () => {
    const r = await svc.addQaPair('kb1', { question: 'q', answer: 'a', similarQuestions: ['x', 'y'] })
    const pairId = r.data!.id
    expect((await svc.deleteQaPair(pairId)).success).toBe(true)
    expect(vectors.deleted).toHaveLength(3)
    expect(await qa.findById(pairId)).toBeNull()
    expect((await svc.deleteQaPair(pairId)).success).toBe(true) // 幂等
  })
})

describe('D1：searchQa 双路径', () => {
  it('命中 QA 命名空间 → 直出答案（文档向量不参与）', async () => {
    await svc.addQaPair('kb1', { question: '怎么开发票', answer: '订单页-开具发票' })
    // 混入一条文档向量（chunkId 无 qa: 前缀）
    vectors.inserted.push({ chunkId: 'chunk_doc_1', knowledgeBaseId: 'kb1', vector: [1] })
    const r = await svc.searchQa({ knowledgeBaseId: 'kb1', query: '开发票', topK: 5 })
    expect(r.success).toBe(true)
    expect(r.data).toHaveLength(1)
    expect(r.data![0]).toMatchObject({ answer: '订单页-开具发票' })
  })

  it('阈值过滤：低于阈值不直出', async () => {
    await svc.addQaPair('kb1', { question: 'q', answer: 'a' })
    const r = await svc.searchQa({ knowledgeBaseId: 'kb1', query: '无关问题', topK: 5, threshold: 0.95 })
    expect(r.data).toHaveLength(0)
  })

  it('无 QA 对 → 快速空返回（零嵌入调用）', async () => {
    embedMock.mockClear()
    const r = await svc.searchQa({ knowledgeBaseId: 'kb1', query: 'x' })
    expect(r.data).toEqual([])
    expect(embedMock).not.toHaveBeenCalled()
  })
})

describe('D1：xlsx 导入导出', () => {
  it('导入（question/answer/similarQuestions 分号分隔）→ 导出回读一致', async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet([
      { question: 'Q1', answer: 'A1', similarQuestions: 'sq1；sq2' },
      { question: 'Q2', answer: 'A2' },
      { question: '', answer: '坏的行' },
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'QA')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const imp = await svc.importQaPairs('kb1', buf)
    expect(imp.data).toEqual({ imported: 2, failed: 1 })

    const exp = await svc.exportQaPairs('kb1')
    expect(exp.success).toBe(true)
    expect(exp.data!.fileName).toBe('测试库-QA.xlsx')
    const back = XLSX.utils.sheet_to_json<Record<string, string>>(XLSX.read(Buffer.from(exp.data!.base64, 'base64')).Sheets['QA'])
    expect(back).toHaveLength(2)
    expect(back[0]).toMatchObject({ question: 'Q1', answer: 'A1', similarQuestions: 'sq1；sq2' })
  })
})
