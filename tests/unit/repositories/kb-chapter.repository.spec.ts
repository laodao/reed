/**
 * KbChapterRepository 单测（M2 章节树数据层）
 * @description 覆盖：全量重建幂等、树形组织（含孤儿挂根）、摘要状态流转与统计。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { KbChapterRepository, type KbChapterInput } from '@core/database/repositories/kb-chapter.repository'
import { LOCAL_DEFAULT_USER_ID, runWithUser } from '@core/context/user-context'

const DOC_ID = 'doc-chapter-test'
const KB_ID = 'kb-chapter-test'

function chapter(over: Partial<KbChapterInput> & { id: string; title: string; ordering: number }): KbChapterInput {
  return {
    documentId: DOC_ID,
    knowledgeBaseId: KB_ID,
    level: 1,
    parentTitle: null,
    parentId: null,
    startOffset: null,
    endOffset: null,
    contentHash: null,
    ...over,
  }
}

describe.each(getTestDialects())('KbChapterRepository [%s]', dialect => {
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
  })

  it('replaceByDocument 全量重建（幂等：二次写入覆盖旧章节）', async () => {
    await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.replaceByDocument(DOC_ID, [
        chapter({ id: 'c1', title: '第一章', ordering: 0 }),
        chapter({ id: 'c2', title: '第二章', ordering: 1 }),
        chapter({ id: 'c3', title: '第三章', ordering: 2 }),
      ]),
    )
    let rows = await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.findByDocument(DOC_ID))
    expect(rows.map(r => r.title)).toEqual(['第一章', '第二章', '第三章'])

    // 重建为 2 章：旧 3 条必须被清除
    const count = await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.replaceByDocument(DOC_ID, [
        chapter({ id: 'n1', title: '新第一章', ordering: 0 }),
        chapter({ id: 'n2', title: '新第二章', ordering: 1 }),
      ]),
    )
    expect(count).toBe(2)
    rows = await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.findByDocument(DOC_ID))
    expect(rows.map(r => r.title)).toEqual(['新第一章', '新第二章'])
    // 摘要状态重置为 pending
    expect(rows.every(r => r.summaryStatus === 'pending')).toBe(true)
  })

  it('treeOf 组织父子层级；孤儿子节点挂到根', async () => {
    await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.replaceByDocument(DOC_ID, [
        chapter({ id: 'root', title: '第一章', ordering: 0, level: 1 }),
        chapter({ id: 'sub', title: '第一节', ordering: 1, level: 2, parentId: 'root' }),
        chapter({ id: 'subsub', title: '一小节', ordering: 2, level: 3, parentId: 'sub' }),
        chapter({ id: 'orphan', title: '孤儿节', ordering: 3, level: 2, parentId: 'missing-parent' }),
      ]),
    )

    const tree = await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.treeOf(DOC_ID))
    // 根：第一章 + 孤儿（parent 不存在 → 挂根）
    expect(tree.map(n => n.title).sort()).toEqual(['孤儿节', '第一章'])
    const root = tree.find(n => n.title === '第一章')!
    expect(root.children.map(n => n.title)).toEqual(['第一节'])
    expect(root.children[0].children.map(n => n.title)).toEqual(['一小节'])
  })

  it('updateSummary 写入摘要与状态；findByStatuses / summaryStats 统计正确', async () => {
    await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.replaceByDocument(DOC_ID, [
        chapter({ id: 'a', title: '章A', ordering: 0 }),
        chapter({ id: 'b', title: '章B', ordering: 1 }),
        chapter({ id: 'c', title: '章C', ordering: 2 }),
      ]),
    )

    await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.updateSummary('a', { summary: 'A 的摘要', status: 'done' }),
    )
    await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.updateSummary('b', { summary: '', status: 'failed', error: 'LLM 超时' }),
    )

    const stats = await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.summaryStats(DOC_ID))
    expect(stats).toEqual({ total: 3, done: 1, failed: 1 })

    const pending = await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.findByStatuses(DOC_ID, ['pending', 'failed']))
    expect(pending.map(r => r.title).sort()).toEqual(['章B', '章C'])

    const done = await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.findByStatuses(DOC_ID, ['done']))
    expect(done).toHaveLength(1)
    expect(done[0].summary).toBe('A 的摘要')
  })

  it('重处理摘要复用：contentHash 未变沿用旧摘要（不再重复调 LLM），变化则重置 pending', async () => {
    await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.replaceByDocument(DOC_ID, [
        chapter({ id: 'c1', title: '第一章', ordering: 0, contentHash: 'h1' }),
        chapter({ id: 'c2', title: '第二章', ordering: 1, contentHash: 'h2' }),
      ]),
    )
    await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.updateSummary('c1', { summary: '第一章摘要', status: 'done' }))
    await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.updateSummary('c2', { summary: '第二章摘要', status: 'done' }))

    // 重建：第一章 hash 不变（复用）、第二章 hash 变化（重置）、第三章新增（pending）
    await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      repo.replaceByDocument(DOC_ID, [
        chapter({ id: 'n1', title: '第一章', ordering: 0, contentHash: 'h1' }),
        chapter({ id: 'n2', title: '第二章', ordering: 1, contentHash: 'h2-changed' }),
        chapter({ id: 'n3', title: '第三章', ordering: 2, contentHash: 'h3' }),
      ]),
    )

    const rows = await runWithUser(LOCAL_DEFAULT_USER_ID, () => repo.findByDocument(DOC_ID))
    const byTitle = new Map(rows.map(r => [r.title, r]))
    expect(byTitle.get('第一章')!.summaryStatus).toBe('done')
    expect(byTitle.get('第一章')!.summary).toBe('第一章摘要')
    expect(byTitle.get('第二章')!.summaryStatus).toBe('pending')
    expect(byTitle.get('第二章')!.summary).toBeNull()
    expect(byTitle.get('第三章')!.summaryStatus).toBe('pending')
  })
})