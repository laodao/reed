/**
 * KbChapterSummaryService 单测（M2 章节摘要）
 * @description 注入 fake LLM 验证：成功写入、失败标记可重试、已 done 跳过、空正文拒绝。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../../../helpers/create-test-data-source'
import { KbChapterRepository, type KbChapterInput } from '@core/database/repositories/kb-chapter.repository'
import { KbChapterSummaryService } from '@core/platform/services/kb-chapter-summary.service'
import { LOCAL_DEFAULT_USER_ID, runWithUser } from '@core/context/user-context'

const DOC_ID = 'doc-summary-test'
const KB_ID = 'kb-summary-test'

function chapter(over: Partial<KbChapterInput> & { id: string; title: string; ordering: number }): KbChapterInput {
  return {
    documentId: DOC_ID,
    knowledgeBaseId: KB_ID,
    level: 1,
    parentId: null,
    parentTitle: null,
    content: '章节正文内容，用于摘要生成。',
    ...over,
  }
}

describe.each(getTestDialects())('KbChapterSummaryService [%s]', dialect => {
  let tds: TestDataSource
  let repo: KbChapterRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new KbChapterRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
    await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.replaceByDocument(DOC_ID, [
        chapter({ id: 'c1', title: '第一章 绪论', ordering: 0, content: '这一章介绍背景与研究动机。' }),
        chapter({ id: 'c2', title: '第二章 方法', ordering: 1, content: '这一章给出方法细节与实验设置。' }),
        chapter({ id: 'c3', title: '第三章 空章', ordering: 2, content: '   ' }),
      ]),
    )
  })

  it('成功生成：摘要写入 + 状态 done；空正文章节标记 failed', async () => {
    const calls: string[] = []
    const service = new KbChapterSummaryService({
      repo,
      llm: async (req) => {
        calls.push(req.user)
        return `摘要：${req.user.slice(0, 12)}`
      },
    })

    const result = await runWithUser(LOCAL_DEFAULT_USER_ID, () => service.summarizeDocument(DOC_ID, { concurrency: 2 }))
    expect(result.done).toBe(2)
    expect(result.failed).toBe(1)
    expect(calls).toHaveLength(2)

    const rows = await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.findByDocument(DOC_ID))
    const c1 = rows.find(r => r.id === 'c1')!
    const c3 = rows.find(r => r.id === 'c3')!
    expect(c1.summaryStatus).toBe('done')
    expect(c1.summary).toContain('摘要：')
    expect(c3.summaryStatus).toBe('failed')
    expect(c3.summaryError).toContain('章节正文为空')
  })

  it('失败可重试：首次抛错标记 failed，retryFailed 后成功并清除错误', async () => {
    let attempt = 0
    const service = new KbChapterSummaryService({
      repo,
      llm: async () => {
        attempt++
        if (attempt === 1) throw new Error('provider 429 限流')
        return '重试后的摘要'
      },
    })

    // 只处理第一章，便于精确控制
    await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.replaceByDocument(DOC_ID, [
      chapter({ id: 'only', title: '唯一章', ordering: 0, content: '正文内容。' }),
    ]))

    const first = await runWithUser(LOCAL_DEFAULT_USER_ID, () => service.summarizeDocument(DOC_ID))
    expect(first.failed).toBe(1)
    let row = (await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.findByDocument(DOC_ID)))[0]
    expect(row.summaryStatus).toBe('failed')
    expect(row.summaryError).toContain('429')

    const second = await runWithUser(LOCAL_DEFAULT_USER_ID, () => service.summarizeDocument(DOC_ID, { retryFailed: true }))
    expect(second.done).toBe(1)
    row = (await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.findByDocument(DOC_ID)))[0]
    expect(row.summaryStatus).toBe('done')
    expect(row.summary).toBe('重试后的摘要')
    expect(row.summaryError).toBeNull()
  })

  it('已 done 的章节跳过（retryFailed=false 时只补 pending）', async () => {
    const service = new KbChapterSummaryService({ repo, llm: async () => '摘要内容' })
    await runWithUser(LOCAL_DEFAULT_USER_ID, () => service.summarizeDocument(DOC_ID))

    const again = await runWithUser(LOCAL_DEFAULT_USER_ID, () => service.summarizeDocument(DOC_ID, { retryFailed: false }))
    // 无 pending（全部 done 或 failed）且不重试 failed → 待处理 0
    expect(again.total).toBe(0)
    expect(again.skipped).toBe(2)
  })
})