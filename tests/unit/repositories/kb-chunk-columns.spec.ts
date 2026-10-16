/**
 * kb_chunks 按需取列测试
 *
 * 背景（真实故障·第二次）：上一轮修了 kb_chapters，但 kb_chunks 有同样的问题——
 * 凡人修仙传文档 6704 个切片、正文 7.09 MB（全库最大），resumeDocument 第一步
 * `findByDocumentId` 就把全部切片连正文读进内存 → SQLITE_CANTOPEN。
 *
 * 实测结论（本测试固化）：
 *  - 含 content 全量读 → 失败；不含 content → 成功
 *  - **分页也救不了**（累积到一定量同样失败）→ 唯一可靠解法是不读不需要的列
 *
 * 契约：
 *  1. findByDocumentId 默认不返回 content
 *  2. includeContent:true 才返回正文
 *  3. findByIds 同样默认不返回正文，支持按批 opt-in（续跑逐批取正文的入口）
 *  4. findByDocumentIdPaginated 默认不读正文（调用方本就丢弃它）
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { KbChunkRepository } from '@core/database/repositories/kb-chunk.repository'
import { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'

describe.each(getTestDialects())('kb_chunks 按需取列与分页 [%s]', dialect => {
  let tds: TestDataSource
  let chunks: KbChunkRepository
  let kbs: KnowledgeBaseRepository
  let docs: KbDocumentRepository
  let kbId: string
  let docId: string

  const BODY = '切片正文内容'.repeat(80)

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    chunks = new KbChunkRepository(tds.ds)
    kbs = new KnowledgeBaseRepository(tds.ds)
    docs = new KbDocumentRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
    const kb = await kbs.create({
      name: 'KB-CHUNK',
      embeddingModel: 'm',
      embeddingDimension: 3,
      embeddingConfig: {} as any,
    } as any)
    kbId = kb.id
    const doc = await docs.create({
      knowledgeBaseId: kbId,
      name: '大切片文档',
      filePath: `knowledge-base/${kbId}/documents/${Date.now()}.txt`,
      fileType: 'txt',
      fileSize: 100,
    })
    docId = doc.id

    await chunks.createBatch(
      Array.from({ length: 30 }, (_, i) => ({
        documentId: docId,
        knowledgeBaseId: kbId,
        content: `${BODY}-${i}`,
        chunkIndex: i,
        startOffset: i * 100,
        endOffset: (i + 1) * 100,
        splitMethod: 'fixed' as any,
      })) as any,
    )
  })

  it('findByDocumentId 默认不读 content', async () => {
    const rows = await chunks.findByDocumentId(docId)
    expect(rows).toHaveLength(30)
    expect(rows.every(r => r.content === undefined || r.content === null)).toBe(true)
    // 元信息必须齐全（向量补齐判定 / 偏移匹配 / 级联删除都靠这些）
    expect(rows[0].id).toBeTruthy()
    expect(rows[0].chunkIndex).toBe(0)
    expect(rows[0].startOffset).toBe(0)
    expect(rows.every(r => typeof r.id === 'string' && r.id.length > 0)).toBe(true)
  })

  it('includeContent:true 时才返回正文', async () => {
    const rows = await chunks.findByDocumentId(docId, { includeContent: true })
    expect(rows).toHaveLength(30)
    expect(rows.every(r => typeof r.content === 'string' && r.content.length > 0)).toBe(true)
    expect(rows[5].content).toBe(`${BODY}-5`)
  })

  it('findByIds 默认不返回正文', async () => {
    const all = await chunks.findByDocumentId(docId)
    const ids = all.slice(0, 5).map(c => c.id)
    const rows = await chunks.findByIds(ids)
    expect(rows).toHaveLength(5)
    expect(rows.every(r => r.content === undefined || r.content === null)).toBe(true)
  })

  it('findByIds + includeContent：按批取正文（续跑"只读当前需要处理的切片"入口）', async () => {
    const all = await chunks.findByDocumentId(docId)
    const ids = all.slice(3, 6).map(c => c.id)
    const rows = await chunks.findByIds(ids, { includeContent: true })
    expect(rows).toHaveLength(3)
    expect(rows.every(r => typeof r.content === 'string' && r.content.length > 0)).toBe(true)
    // 内容与 chunkIndex 对应正确（不存在批间串位）
    const byId = new Map(rows.map(r => [r.id, r.content]))
    for (const c of all.slice(3, 6)) {
      expect(byId.get(c.id)).toBe(`${BODY}-${c.chunkIndex}`)
    }
  })

  it('findByDocumentIdPaginated 默认不读正文', async () => {
    const rows = await chunks.findByDocumentIdPaginated(docId, 0, 10)
    expect(rows).toHaveLength(10)
    expect(rows.every(r => r.content === undefined || r.content === null)).toBe(true)
  })

  it('分页可遍历全部且顺序稳定（chunkIndex ASC）', async () => {
    const collected: number[] = []
    for (let off = 0; off < 30; off += 10) {
      const rows = await chunks.findByDocumentIdPaginated(docId, off, 10)
      collected.push(...rows.map(r => r.chunkIndex))
    }
    expect(collected).toHaveLength(30)
    expect(collected).toEqual(Array.from({ length: 30 }, (_, i) => i))
  })

  it('findByDocumentId 支持 limit（续跑判定阶段的上界保护）', async () => {
    const rows = await chunks.findByDocumentId(docId, { limit: 7 })
    expect(rows).toHaveLength(7)
    expect(rows.map(r => r.chunkIndex)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})