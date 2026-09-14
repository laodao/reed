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
  /** 评审 #75：可注入的写入失败（测试补偿回滚） */
  failCreateBatch: Error | null = null
  async createBatch(items: any[]) {
    if (this.failCreateBatch) throw this.failCreateBatch
    this.inserted.push(...items)
    return items
  }
  // 方法名必须与真实 KbVectorRepository 一致（曾因假仓库多出 getByChunkId/deleteByChunkIds
  // 而掩盖了生产代码调用不存在方法的缺陷，见本文件末尾的「假仓库不漂移」用例）
  async findByChunkId(chunkId: string) {
    return this.inserted.find(x => x.chunkId === chunkId) ?? null
  }
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

import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'

// 嵌入 mock：单向量恒等（长度按文本长度，便于断言批次数）
const embedMock = vi.fn(async (texts: string[]) => texts.map(t => [t.length]))
;(KnowledgeBaseService.prototype as any).getEmbeddingVectors = embedMock

const svc = new KnowledgeBaseService()
beforeEach(() => {
  qa.rows.clear(); vectors.inserted = []; vectors.deleted = []; kbs.statsCalls = []
  vectors.failCreateBatch = null
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

  it('updateQaPair 写向量失败 → 补偿回滚：旧向量恢复、文本回滚、无孤儿（评审#75）', async () => {
    const r = await svc.addQaPair('kb1', { question: 'q1', answer: 'a1', similarQuestions: ['s1'] })
    const pairId = r.data!.id
    const oldInserted = [...vectors.inserted]
    // 新向量写入阶段失败
    vectors.failCreateBatch = new Error('向量库写入失败')
    const res = await svc.updateQaPair(pairId, { question: 'q1-改', answer: 'a1-改' })
    expect(res.success).toBe(false)
    expect(res.error).toContain('向量库写入失败')
    // 文本行回滚为旧值
    const row = await qa.findById(pairId)
    expect(row.question).toBe('q1')
    expect(row.answer).toBe('a1')
    expect(row.similarQuestions).toEqual(['s1'])
    // 旧向量已恢复（快照重建），当前无残留新向量
    const restored = await Promise.all(oldInserted.map(x => vectors.findByChunkId(x.chunkId)))
    for (const rec of restored) expect(rec).not.toBeNull()
  })

  it('updateQaPair 生成向量失败（嵌入阶段）→ 不动任何数据', async () => {
    const r = await svc.addQaPair('kb1', { question: 'q2', answer: 'a2' })
    const pairId = r.data!.id
    const insertedBefore = [...vectors.inserted]
    const deletedBefore = [...vectors.deleted]
    embedMock.mockImplementationOnce(async () => { throw new Error('嵌入服务不可用') })
    const res = await svc.updateQaPair(pairId, { question: 'q2-改' })
    expect(res.success).toBe(false)
    // 未删除任何旧向量、未改文本
    expect(vectors.deleted).toEqual(deletedBefore)
    expect(vectors.inserted).toEqual(insertedBefore)
    expect((await qa.findById(pairId)).question).toBe('q2')
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

  it('导入文件超过 10MB 上限 → 拒绝（评审#77）', async () => {
    // 构造一个声明 10MB+ 的 Buffer（内容不必是合法 xlsx——大小校验在读解析器之前）
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61)
    const res = await svc.importQaPairs('kb1', big)
    expect(res.success).toBe(false)
    expect(res.error).toContain('文件超出上限')
    expect(qa.rows.size).toBe(0)
  })

  it('导入行数超过 1 万上限 → 拒绝（评审#77）', async () => {
    const XLSX = await import('xlsx')
    const rows = Array.from({ length: 10_001 }, (_, i) => ({ question: `q${i}`, answer: 'a' }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'QA')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const res = await svc.importQaPairs('kb1', buf)
    expect(res.success).toBe(false)
    expect(res.error).toContain('行数超出上限')
    expect(qa.rows.size).toBe(0)
  })
})

describe('假仓库不漂移（评审 #75 回归）', () => {
  /**
   * 背景：假向量仓库曾提供 getByChunkId/deleteByChunkIds 这两个真实仓库**不存在**的方法，
   * 于是服务层调用它们的缺陷在单测里全绿、到线上才崩（findByChunkId is not a function）。
   * 这里用真实仓库原型校验「服务依赖的方法名」确实存在，并保证假仓库同形。
   */
  it('服务用到的向量仓库方法在真实仓库与假仓库上都存在', async () => {
    const { KbVectorRepository } = await import('@core/database/repositories/kb-vector.repository')
    const used = ['createBatch', 'findByChunkId', 'deleteByChunkId', 'searchSimilar']
    const fake = new MemVectors() as unknown as Record<string, unknown>
    const proto = KbVectorRepository.prototype as unknown as Record<string, unknown>
    for (const name of used) {
      expect(typeof proto[name], `真实仓库缺少 ${name}`).toBe('function')
      expect(typeof fake[name], `假仓库缺少 ${name}`).toBe('function')
    }
    // 假仓库不得实现真实仓库没有的方法（避免再次掩盖调用缺陷）
    for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(fake))) {
      if (name === 'constructor') continue
      expect(typeof proto[name], `假仓库多出不存在的 ${name}`).not.toBe('undefined')
    }
  })
})
