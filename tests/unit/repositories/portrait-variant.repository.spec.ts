import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { PortraitVariantRepository } from '@core/database/repositories/portrait-variant.repository'
import { PortraitCharacterRepository } from '@core/database/repositories/portrait-character.repository'

const variantInput = (over: any = {}) => ({
  characterId: 'char-1',
  type: 'base' as const,
  angle: 'front' as const,
  imagePath: '/img/a.png',
  prompt: 'a portrait',
  config: { quality: 'high' },
  ...over,
})

describe.each(getTestDialects())('PortraitVariantRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: PortraitVariantRepository
  let charRepo: PortraitCharacterRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new PortraitVariantRepository(tds.ds)
    charRepo = new PortraitCharacterRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + getById：JSON config 往返 + createdAt epoch ms', async () => {
    const v = await repo.create(variantInput())
    expect(v.id).toBeTruthy()
    expect(v.config).toEqual({ quality: 'high' })
    expect(typeof v.createdAt).toBe('number')

    const got = await repo.getById(v.id)
    expect(got).toEqual(v)
  })

  it('createBatch 事务批量插入', async () => {
    const list = await repo.createBatch([
      variantInput({ angle: 'front' }),
      variantInput({ angle: 'side', imagePath: '/img/b.png' }),
      variantInput({ angle: 'back', imagePath: '/img/c.png' }),
    ])
    expect(list).toHaveLength(3)
    expect(await repo.countByCharacterId('char-1')).toBe(3)
  })

  it('getByCharacterId 按 created_at DESC 排序', async () => {
    const a = await repo.create(variantInput({ characterId: 'char-1' }))
    await new Promise(r => setTimeout(r, 5))
    const b = await repo.create(variantInput({ characterId: 'char-1', angle: 'side' }))
    await repo.create(variantInput({ characterId: 'char-2' }))

    const list = await repo.getByCharacterId('char-1')
    expect(list.map(x => x.id)).toEqual([b.id, a.id])
  })

  it('getByCharacterAndAngle 精确查询', async () => {
    await repo.create(variantInput({ angle: 'front', type: 'base' }))
    await repo.create(variantInput({ angle: 'side', type: 'base' }))
    const got = await repo.getByCharacterAndAngle('char-1', 'base' as any, 'side' as any)
    expect(got!.angle).toBe('side')
  })

  it('update 部分字段', async () => {
    const v = await repo.create(variantInput())
    const updated = await repo.update(v.id, { imagePath: '/img/new.png' })
    expect(updated!.imagePath).toBe('/img/new.png')
    expect(updated!.prompt).toBe('a portrait')
  })

  it('delete + deleteByCharacterId', async () => {
    await repo.create(variantInput({ characterId: 'char-1' }))
    await repo.create(variantInput({ characterId: 'char-1', angle: 'side' }))
    expect(await repo.countByCharacterId('char-1')).toBe(2)
    await repo.deleteByCharacterId('char-1')
    expect(await repo.countByCharacterId('char-1')).toBe(0)
  })

  it('getBaseVariants / getFrontVariant / getClothesVariants', async () => {
    await repo.create(variantInput({ type: 'base', angle: 'front' }))
    await repo.create(variantInput({ type: 'base', angle: 'side' }))
    await repo.create(variantInput({ type: 'clothes', angle: 'front' }))

    const baseList = await repo.getBaseVariants('char-1')
    expect(baseList).toHaveLength(2)

    const front = await repo.getFrontVariant('char-1')
    expect(front!.type).toBe('base')
    expect(front!.angle).toBe('front')

    const clothes = await repo.getClothesVariants('char-1')
    expect(clothes).toHaveLength(1)
  })

  it('getByProjectId 通过 character JOIN（兼容 API）', async () => {
    const c1 = await charRepo.create({
      projectId: 'p1',
      name: 'C1',
      gender: 'male',
      age: 25,
      height: 175,
      weight: 70,
      race: 'asian',
    })
    const c2 = await charRepo.create({
      projectId: 'p2',
      name: 'C2',
      gender: 'female',
      age: 25,
      height: 165,
      weight: 55,
      race: 'asian',
    })

    await repo.create(variantInput({ characterId: c1.id }))
    await repo.create(variantInput({ characterId: c1.id, angle: 'side' }))
    await repo.create(variantInput({ characterId: c2.id }))

    const list = await repo.getByProjectId('p1')
    expect(list).toHaveLength(2)
    expect(await repo.countByProjectId('p1')).toBe(2)

    await repo.deleteByProjectId('p1')
    expect(await repo.countByProjectId('p1')).toBe(0)
  })
})
