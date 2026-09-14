/**
 * KbChunkRepository 单测（M5 章节过滤）
 * @description 分片分页查询支持按章节过滤：结构块靠 title，段落子块靠 section_path
 *              （JSON 数组）包含章节标题；过滤后分页/计数一致。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { KbChunkRepository } from '@core/database/repositories/kb-chunk.repository'
import { LOCAL_DEFAULT_USER_ID, runWithUser } from '@core/context/user-context'

const DOC_ID = 'doc-chunk-filter'
const KB_ID = 'kb-chunk-filter'

describe.each(getTestDialects())('KbChunkRepository 章节过滤 [%s]', dialect => {
  let tds: TestDataSource
  let repo: KbChunkRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new KbChunkRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
    await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.createBatch([
        // 第二章下的结构块 + 两个段落子块（子块仅有 section_path）
        {
          documentId: DOC_ID,
          knowledgeBaseId: KB_ID,
          content: '第二章 公司登记 全文……',
          chunkIndex: 0,
          title: '第二章 公司登记',
          level: 1,
          splitMethod: 'structure',
          sectionPath: ['第二章 公司登记'],
        },
        {
          documentId: DOC_ID,
          knowledgeBaseId: KB_ID,
          content: '第二十九条 设立公司……',
          chunkIndex: 1,
          title: '第二章 公司登记',
          level: 2,
          splitMethod: 'sub-semantic',
          sectionPath: ['第二章 公司登记', '第一节 设立'],
        },
        {
          documentId: DOC_ID,
          knowledgeBaseId: KB_ID,
          content: '第三十条 申请设立公司……',
          chunkIndex: 2,
          splitMethod: 'sub-semantic',
          sectionPath: ['第二章 公司登记', '第一节 设立'],
        },
        // 第十五章：不应被第二章过滤命中
        {
          documentId: DOC_ID,
          knowledgeBaseId: KB_ID,
          content: '第十五章 附则……',
          chunkIndex: 3,
          title: '第十五章 附则',
          level: 1,
          splitMethod: 'structure',
          sectionPath: ['第十五章 附则'],
        },
      ]),
    )
  })

  it('无过滤：分页返回全部并按 chunkIndex 升序', async () => {
    const all = await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.findByDocumentIdPaginated(DOC_ID, 0, 10))
    expect(all.map(c => c.chunkIndex)).toEqual([0, 1, 2, 3])
    const total = await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.countByDocumentIdPaginated(DOC_ID))
    expect(total).toBe(4)
  })

  it('按章节过滤：命中 title 与 section_path（父路径）两类块', async () => {
    const rows = await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.findByDocumentIdPaginated(DOC_ID, 0, 10, '第二章 公司登记'),
    )
    expect(rows.map(c => c.chunkIndex)).toEqual([0, 1, 2])
    const total = await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.countByDocumentIdPaginated(DOC_ID, '第二章 公司登记'),
    )
    expect(total).toBe(3)
  })

  it('按子节过滤：仅命中 section_path 含该子节的块', async () => {
    const rows = await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.findByDocumentIdPaginated(DOC_ID, 0, 10, '第一节 设立'),
    )
    expect(rows.map(c => c.chunkIndex)).toEqual([1, 2])
  })

  it('过滤 + 分页偏移正确', async () => {
    const page2 = await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.findByDocumentIdPaginated(DOC_ID, 2, 2, '第二章 公司登记'),
    )
    expect(page2.map(c => c.chunkIndex)).toEqual([2])
  })

  it('不存在的章节：过滤后为空', async () => {
    const rows = await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.findByDocumentIdPaginated(DOC_ID, 0, 10, '不存在的章节'),
    )
    expect(rows).toHaveLength(0)
  })
})