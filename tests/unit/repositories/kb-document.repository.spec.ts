/**
 * KbDocumentRepository 单测
 * @description 重点覆盖状态回写方法（updateProgress / markCompleted / markFailed）
 *              的行数校验语义 —— scoped.update 返回 number（affected 行数），
 *              校验必须按 number 判，且 user_id 匹配时绝不能误抛。
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { LOCAL_DEFAULT_USER_ID, runWithUser } from '@core/context/user-context'

describe.each(getTestDialects())('KbDocumentRepository [%s]', dialect => {
  let tds: TestDataSource
  let kbRepo: KnowledgeBaseRepository
  let docRepo: KbDocumentRepository
  let kbId: string

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    kbRepo = new KnowledgeBaseRepository(tds.ds)
    docRepo = new KbDocumentRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
    const kb = await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      kbRepo.create({
        name: `测试库-${Math.random()}`,
        embeddingModel: 'text-embedding-3-small',
        embeddingDimension: 1536,
      } as any),
    )
    kbId = kb.id
  })

  function makeDoc(name: string) {
    return runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      docRepo.create({
        knowledgeBaseId: kbId,
        name,
        filePath: `/tmp/${name}`,
        fileType: 'txt' as const,
        fileSize: 100,
      }),
    )
  }

  it('create: 注入当前 ALS userId', async () => {
    const doc = await makeDoc('a.txt')
    const got = await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      docRepo.findById(doc.id),
    )
    expect(got).not.toBeNull()
    expect(got!.name).toBe('a.txt')
  })

  it('updateProgress: user_id 匹配时正常更新，不误抛"未更新任何行"', async () => {
    const doc = await makeDoc('b.txt')
    await expect(
      runWithUser(LOCAL_DEFAULT_USER_ID, () => docRepo.updateProgress(doc.id, 10)),
    ).resolves.toBeUndefined()

    const got = await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      docRepo.findById(doc.id),
    )
    expect(got!.status).toBe('processing')
    expect(got!.progress).toBe(10)
  })

  it('markCompleted / markFailed: user_id 匹配时正常回写', async () => {
    const doc = await makeDoc('c.txt')
    await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      docRepo.markCompleted(doc.id, 5),
    )
    let got = await runWithUser(LOCAL_DEFAULT_USER_ID, () => docRepo.findById(doc.id))
    expect(got!.status).toBe('completed')
    expect(got!.progress).toBe(100)
    expect(got!.chunkCount).toBe(5)

    await expect(
      runWithUser(LOCAL_DEFAULT_USER_ID, () =>
        docRepo.markFailed(doc.id, 'boom'),
      ),
    ).resolves.toBeUndefined()
    got = await runWithUser(LOCAL_DEFAULT_USER_ID, () => docRepo.findById(doc.id))
    expect(got!.status).toBe('failed')
    expect(got!.errorMessage).toBe('boom')
  })

  it('updateProgress: 目标行不存在时抛错（真 0 行更新）', async () => {
    await expect(
      runWithUser(LOCAL_DEFAULT_USER_ID, () =>
        docRepo.updateProgress('nonexistent-id', 10),
      ),
    ).rejects.toThrow(/未更新任何行/)
  })

  it('user_id 不匹配的行在别的用户上下文里不可见也不可改', async () => {
    const doc = await makeDoc('d.txt')
    await expect(
      runWithUser('another-user', () => docRepo.updateProgress(doc.id, 10)),
    ).rejects.toThrow(/未更新任何行/)
    const got = await runWithUser(LOCAL_DEFAULT_USER_ID, () =>
      docRepo.findById(doc.id),
    )
    expect(got).not.toBeNull() // 原用户数据未被越权改动
  })
})
