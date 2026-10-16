/**
 * kb_chapters 按需取列 / 分页 测试
 *
 * 背景（真实故障）：凡人修仙传文档有 2470 个章节、content 合计 7.14 MB。
 * findByDocument 无条件把 content 全量读出，SQLite 读溢出页需临时存储，失败即抛
 * SQLITE_CANTOPEN: unable to open database file（文案误导，实为临时文件打不开）。
 * 现象：该知识库检索/章节树/重处理全部失败，其余 13 个知识库正常。
 *
 * 契约（改了必然要断言的几条）：
 *  1. findByDocument 默认【不读 content】（列为 null），只取元信息
 *  2. includeContent:true 时才返回正文
 *  3. findByDocumentPaged 分页取正文，逐页读取量有界
 *  4. 默认返回结果仍满足 buildChapterLookup/treeOf 的需求（id/title/parentId 齐全）
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { buildChapterLookup, matchChapter } from '@core/platform/services/kb-chapter-lookup'

describe.each(getTestDialects())('kb_chapters 按需取列与分页 [%s]', dialect => {
  let tds: TestDataSource
  let chapters: KbChapterRepository
  let kbs: KnowledgeBaseRepository
  let docs: KbDocumentRepository
  let kbId: string
  let docId: string

  const BIG = '第壹章正文'.repeat(200) // 约 1KB/章

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    chapters = new KbChapterRepository(tds.ds)
    kbs = new KnowledgeBaseRepository(tds.ds)
    docs = new KbDocumentRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
    const kb = await kbs.create({
      name: 'KB-CH',
      embeddingModel: 'm',
      embeddingDimension: 3,
      embeddingConfig: {} as any,
    } as any)
    kbId = kb.id
    const doc = await docs.create({
      knowledgeBaseId: kbId,
      name: '大章节文档',
      filePath: `knowledge-base/${kbId}/documents/${Date.now()}.txt`,
      fileType: 'txt',
      fileSize: 100,
    })
    docId = doc.id

    // 20 章，每章带正文
    await chapters.replaceByDocument(
      docId,
      Array.from({ length: 20 }, (_, i) => ({
        id: `ch-${i}`,
        documentId: docId,
        knowledgeBaseId: kbId,
        title: i === 0 ? '第一章 起始' : `第${i + 1}章 章节${i}`,
        level: 1,
        parentId: i === 0 ? null : 'ch-0',
        parentTitle: i === 0 ? null : '第一章 起始',
        ordering: i,
        content: `${BIG}-${i}`,
        contentHash: `hash-${i}`,
      })) as any,
    )
  })

  it('findByDocument 默认不读 content（只取元信息）', async () => {
    const rows = await chapters.findByDocument(docId)
    expect(rows).toHaveLength(20)
    // 关键断言：默认不返回正文，避免大字段全量拉取
    expect(rows.every(r => r.content === null)).toBe(true)
    // 但元信息必须齐全（检索/建树的消费面）
    expect(rows[0].id).toBe('ch-0')
    expect(rows[0].title).toBe('第一章 起始')
    expect(rows[0].ordering).toBe(0)
    expect(rows[0].parentId).toBeNull()
    expect(rows[1].parentId).toBe('ch-0')
    expect(rows.every(r => typeof r.contentHash === 'string')).toBe(true)
  })

  it('includeContent:true 时才返回正文', async () => {
    const rows = await chapters.findByDocument(docId, { includeContent: true })
    expect(rows).toHaveLength(20)
    expect(rows.every(r => typeof r.content === 'string' && r.content.length > 0)).toBe(true)
    expect(rows[3].content).toBe(`${BIG}-3`)
  })

  it('默认结果足以支撑章节查找（buildChapterLookup / matchChapter）', async () => {
    const rows = await chapters.findByDocument(docId)
    const lookup = buildChapterLookup(rows)
    // 标题精确命中
    const hit = matchChapter(lookup, '第一章 起始', null)
    expect(hit?.id).toBe('ch-0')
    // 路径命中（同名消歧依赖 parentId/title）
    const hit2 = matchChapter(lookup, null, JSON.stringify(['第一章 起始', '第2章 章节1']))
    expect(hit2?.id).toBe('ch-1')
  })

  it('treeOf 在默认不读 content 下仍能正确建树', async () => {
    const tree = await chapters.treeOf(docId)
    expect(tree).toHaveLength(1) // 单根
    expect(tree[0].id).toBe('ch-0')
    expect(tree[0].children).toHaveLength(19)
    expect(tree[0].content).toBeNull()
  })

  it('summaryStats 不读 content 也能统计', async () => {
    const stats = await chapters.summaryStats(docId)
    expect(stats.total).toBe(20)
    expect(stats.done).toBe(0)
  })

  it('findByDocumentPaged：分页取正文，逐页有界且可遍历全部', async () => {
    const pageSize = 6
    const collected: string[] = []
    let page = 0
    for (;;) {
      const rows = await chapters.findByDocumentPaged(docId, {
        limit: pageSize,
        offset: page * pageSize,
        includeContent: true,
      })
      if (rows.length === 0) break
      expect(rows.length).toBeLessThanOrEqual(pageSize)
      collected.push(...rows.map(r => r.id))
      page++
      if (page > 10) throw new Error('分页未收敛')
    }
    expect(collected).toHaveLength(20)
    expect(new Set(collected).size).toBe(20) // 无重复
    // 顺序稳定（ordering ASC）
    expect(collected[0]).toBe('ch-0')
    expect(collected[19]).toBe('ch-19')
  })

  it('findByStatuses 默认不返回正文（摘要调度不需要全量正文入内存）', async () => {
    const rows = await chapters.findByStatuses(docId, ['pending'])
    expect(rows.length).toBe(20)
    expect(rows.every(r => r.content === null)).toBe(true)
  })
})