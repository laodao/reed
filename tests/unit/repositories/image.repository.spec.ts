import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { ImageRepository } from '@core/database/repositories/image.repository'

const fixture = (over: any = {}) => ({
  filePath: '/tmp/img.png',
  prompt: 'a cat',
  providerId: 'p1',
  modelId: 'm1',
  ...over,
})

describe.each(getTestDialects())('ImageRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: ImageRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new ImageRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + getById：默认 status=completed + favorite=false + JSON 生成参数', async () => {
    const img = await repo.create(
      fixture({ generationParams: { steps: 30, cfg: 7.5 } }) as any,
    )
    expect(img.status).toBe('completed')
    expect(img.favorite).toBe(false)
    expect(img.createdAt).toBeInstanceOf(Date)
    expect(img.generationParams).toEqual({ steps: 30, cfg: 7.5 })

    const got = await repo.getById(img.id)
    expect(got!.id).toBe(img.id)
  })

  it('create 显式 status / errorMessage / seed', async () => {
    const img = await repo.create(
      fixture({ status: 'failed', errorMessage: 'oops', seed: 42 }) as any,
    )
    expect(img.status).toBe('failed')
    expect(img.errorMessage).toBe('oops')
    expect(img.seed).toBe(42)
  })

  it('getList 分页 + favoriteOnly + status 过滤', async () => {
    await repo.create(fixture({ status: 'completed' }) as any)
    const fav = await repo.create(fixture({ status: 'completed' }) as any)
    await repo.toggleFavorite(fav.id)
    await repo.create(fixture({ status: 'failed' }) as any)

    const all = await repo.getList(1, 10)
    expect(all.total).toBe(3)
    expect(all.hasMore).toBe(false)

    const onlyFav = await repo.getList(1, 10, true)
    expect(onlyFav.total).toBe(1)

    const onlyCompleted = await repo.getList(1, 10, false, 'completed')
    expect(onlyCompleted.total).toBe(2)
  })

  it('getByTaskId 多张图', async () => {
    await repo.create(fixture({ taskId: 't1' }) as any)
    await repo.create(fixture({ taskId: 't1' }) as any)
    await repo.create(fixture({ taskId: 't2' }) as any)
    expect((await repo.getByTaskId('t1')).length).toBe(2)
  })

  it('update 部分字段 + JSON 列覆盖', async () => {
    const img = await repo.create(
      fixture({ generationParams: { a: 1 } }) as any,
    )
    await repo.update(img.id, {
      filePath: '/new/path.png',
      generationParams: { b: 2 } as any,
    })
    const got = await repo.getById(img.id)
    expect(got!.filePath).toBe('/new/path.png')
    expect(got!.generationParams).toEqual({ b: 2 })
  })

  it('updateStatus + updateStatusByTaskId 计数', async () => {
    const img = await repo.create(fixture({ taskId: 't' }) as any)
    await repo.updateStatus(img.id, 'failed', 'fail-msg')
    expect((await repo.getById(img.id))!.status).toBe('failed')
    expect((await repo.getById(img.id))!.errorMessage).toBe('fail-msg')

    await repo.create(fixture({ taskId: 't' }) as any)
    const updated = await repo.updateStatusByTaskId('t', 'completed')
    expect(updated).toBe(2)
  })

  it('delete + deleteMany 计数', async () => {
    const a = await repo.create(fixture() as any)
    const b = await repo.create(fixture() as any)
    await repo.create(fixture() as any)

    await repo.delete(a.id)
    expect(await repo.count()).toBe(2)

    expect(await repo.deleteMany([b.id, 'nope'])).toBe(1)
    expect(await repo.count()).toBe(1)
  })

  it('toggleFavorite 切换', async () => {
    const img = await repo.create(fixture() as any)
    expect(await repo.toggleFavorite(img.id)).toBe(true)
    expect((await repo.getById(img.id))!.favorite).toBe(true)
    expect(await repo.toggleFavorite(img.id)).toBe(false)
  })

  it('count 全量 + favoriteOnly + status', async () => {
    await repo.create(fixture({ status: 'completed' }) as any)
    await repo.create(fixture({ status: 'failed' }) as any)
    expect(await repo.count()).toBe(2)
    expect(await repo.count(false, 'failed')).toBe(1)
  })

  it('getByProvider / getByModel 过滤分页', async () => {
    await repo.create(fixture({ providerId: 'p1', modelId: 'm1' }) as any)
    await repo.create(fixture({ providerId: 'p1', modelId: 'm2' }) as any)
    await repo.create(fixture({ providerId: 'p2', modelId: 'm1' }) as any)

    expect((await repo.getByProvider('p1')).total).toBe(2)
    expect((await repo.getByModel('m1')).total).toBe(2)
  })
})
