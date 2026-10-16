import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { PortraitCharacterRepository } from '@core/database/repositories/portrait-character.repository'

const fixture = (over: any = {}) => ({
  projectId: 'proj-1',
  name: 'Hero',
  gender: 'male' as const,
  age: 25,
  height: 175,
  weight: 70,
  race: 'asian' as const,
  description: '主角',
  ...over,
})

describe.each(getTestDialects())('PortraitCharacterRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: PortraitCharacterRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new PortraitCharacterRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + getById：基本字段 + 默认 config + 空 referenceImages', async () => {
    const c = await repo.create(fixture())
    expect(c.id).toBeTruthy()
    expect(c.referenceImages).toEqual([])
    expect(c.config).toMatchObject({ angles: ['front'], backgroundType: 'solid' })

    const got = await repo.getById(c.id)
    expect(got).toEqual(c)
  })

  it('create 传入 config 与默认合并', async () => {
    const c = await repo.create(
      fixture({ config: { angles: ['front', 'side'] } as any }),
    )
    expect(c.config.angles).toEqual(['front', 'side'])
    expect((c.config as any).backgroundType).toBe('solid')
  })

  it('JSON referenceImages 往返保留数组', async () => {
    const c = await repo.create(
      fixture({ referenceImages: ['url1', 'url2'] }),
    )
    const got = await repo.getById(c.id)
    expect(got!.referenceImages).toEqual(['url1', 'url2'])
  })

  it('getByProjectId 按 created_at DESC 排序', async () => {
    const a = await repo.create(fixture({ projectId: 'p1', name: 'A' }))
    await new Promise(r => setTimeout(r, 5))
    const b = await repo.create(fixture({ projectId: 'p1', name: 'B' }))
    await repo.create(fixture({ projectId: 'p2', name: 'C' }))

    const list = await repo.getByProjectId('p1')
    expect(list.map(x => x.id)).toEqual([b.id, a.id])
  })

  it('update 部分字段 + config 浅合并', async () => {
    const c = await repo.create(fixture({
      config: { angles: ['front'], backgroundType: 'solid' } as any,
    }))
    const updated = await repo.update({
      id: c.id,
      name: 'Hero2',
      config: { backgroundType: 'transparent' } as any,
    })
    expect(updated!.name).toBe('Hero2')
    expect(updated!.config.angles).toEqual(['front']) // 保留
    expect((updated!.config as any).backgroundType).toBe('transparent') // 覆盖
  })

  it('delete + deleteByProjectId + countByProjectId', async () => {
    await repo.create(fixture({ projectId: 'p1' }))
    const x = await repo.create(fixture({ projectId: 'p1' }))
    await repo.create(fixture({ projectId: 'p2' }))

    expect(await repo.countByProjectId('p1')).toBe(2)
    await repo.delete(x.id)
    expect(await repo.countByProjectId('p1')).toBe(1)
    await repo.deleteByProjectId('p1')
    expect(await repo.countByProjectId('p1')).toBe(0)
    expect(await repo.countByProjectId('p2')).toBe(1)
  })

  it('createdAt 是 number (epoch ms)', async () => {
    const c = await repo.create(fixture())
    expect(typeof c.createdAt).toBe('number')
    expect(typeof c.updatedAt).toBe('number')
  })
})
