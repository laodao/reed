import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { PortraitProjectRepository } from '@core/database/repositories/portrait-project.repository'

describe.each(getTestDialects())('PortraitProjectRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: PortraitProjectRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new PortraitProjectRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create 后 getById 返回数据，时间字段为 epoch ms (number)', async () => {
    const before = Date.now()
    const created = await repo.create({ name: 'P1', description: 'desc' })
    const after = Date.now()

    expect(typeof created.createdAt).toBe('number')
    expect(typeof created.updatedAt).toBe('number')
    expect(created.createdAt).toBeGreaterThanOrEqual(before)
    expect(created.createdAt).toBeLessThanOrEqual(after)

    const got = await repo.getById(created.id)
    expect(got).toBeTruthy()
    expect(got!.id).toBe(created.id)
    expect(got!.name).toBe('P1')
    expect(got!.description).toBe('desc')
    expect(typeof got!.createdAt).toBe('number')
  })

  it('create 不传 description 时返回 description=undefined', async () => {
    const created = await repo.create({ name: 'NoDesc' })
    expect(created.description).toBeUndefined()
    const got = await repo.getById(created.id)
    expect(got!.description).toBeUndefined()
  })

  it('getById 不存在返回 null', async () => {
    expect(await repo.getById('nope')).toBeNull()
  })

  it('getList 分页 + 总数返回', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.create({ name: `P${i}` })
      await new Promise(r => setTimeout(r, 5))
    }
    const page1 = await repo.getList(1, 3)
    expect(page1.total).toBe(5)
    expect(page1.projects).toHaveLength(3)
    const page2 = await repo.getList(2, 3)
    expect(page2.projects).toHaveLength(2)
  })

  it('update 部分字段', async () => {
    const created = await repo.create({ name: 'Old' })
    const updated = await repo.update({
      id: created.id,
      name: 'New',
      defaultModelId: 'gpt-5',
    })
    expect(updated).toBeTruthy()
    expect(updated!.name).toBe('New')
    expect(updated!.defaultModelId).toBe('gpt-5')
  })

  it('update 不存在的 id 返回 null', async () => {
    expect(await repo.update({ id: 'nope', name: 'X' })).toBeNull()
  })

  it('delete 后 getById null', async () => {
    const c = await repo.create({ name: 'X' })
    await repo.delete(c.id)
    expect(await repo.getById(c.id)).toBeNull()
  })

  it('count 返回总数', async () => {
    expect(await repo.count()).toBe(0)
    await repo.create({ name: 'A' })
    await repo.create({ name: 'B' })
    expect(await repo.count()).toBe(2)
  })
})
