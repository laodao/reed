import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { TranslationRepository } from '@core/database/repositories/translation.repository'

const fixture = (over: any = {}) => ({
  type: 'text' as const,
  sourceLanguage: 'en' as any,
  targetLanguage: 'zh-CN' as any,
  sourceText: 'hello',
  targetText: '你好',
  status: 'completed' as const,
  favorite: false,
  wordCount: 5,
  ...over,
})

describe.each(getTestDialects())('TranslationRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: TranslationRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new TranslationRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + getById：基础字段 + favorite=boolean + createdAt=Date', async () => {
    const r = await repo.create(fixture())
    expect(r.id).toBeTruthy()
    expect(r.favorite).toBe(false)
    expect(r.createdAt).toBeInstanceOf(Date)

    const got = await repo.getById(r.id)
    expect(got).toBeTruthy()
    expect(got!.sourceText).toBe('hello')
    expect(got!.targetText).toBe('你好')
    expect(got!.favorite).toBe(false)
  })

  it('getList 分页 + type 过滤 + favorite 过滤', async () => {
    await repo.create(fixture({ type: 'text', favorite: true }))
    await repo.create(fixture({ type: 'text', favorite: false }))
    await repo.create(fixture({ type: 'file', favorite: true }))

    const all = await repo.getList({ page: 1, pageSize: 10 } as any)
    expect(all.total).toBe(3)

    const textOnly = await repo.getList({
      page: 1,
      pageSize: 10,
      type: 'text',
    } as any)
    expect(textOnly.total).toBe(2)

    const favOnly = await repo.getList({
      page: 1,
      pageSize: 10,
      favorite: true,
    } as any)
    expect(favOnly.total).toBe(2)
  })

  it('update 部分字段', async () => {
    const r = await repo.create(fixture({ status: 'processing' }))
    await repo.update(r.id, { status: 'completed', targetText: 'final' })
    const got = await repo.getById(r.id)
    expect(got!.status).toBe('completed')
    expect(got!.targetText).toBe('final')
  })

  it('toggleFavorite 切换并返回新状态', async () => {
    const r = await repo.create(fixture({ favorite: false }))
    expect(await repo.toggleFavorite(r.id)).toBe(true)
    expect(await repo.toggleFavorite(r.id)).toBe(false)
  })

  it('toggleFavorite 不存在抛错', async () => {
    await expect(repo.toggleFavorite('nope')).rejects.toThrow()
  })

  it('delete + count', async () => {
    const r = await repo.create(fixture())
    await repo.create(fixture({ favorite: true }))
    expect(await repo.count()).toBe(2)
    expect(await repo.count(true)).toBe(1)

    await repo.delete(r.id)
    expect(await repo.count()).toBe(1)
  })

  it('getList 按 created_at DESC', async () => {
    const a = await repo.create(fixture({ sourceText: 'A' }))
    await new Promise(r => setTimeout(r, 5))
    const b = await repo.create(fixture({ sourceText: 'B' }))
    const list = (await repo.getList({ page: 1, pageSize: 10 } as any)).list
    expect(list.map(x => x.id)).toEqual([b.id, a.id])
  })
})
