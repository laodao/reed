/**
 * LW 批次 8：lw-dictionary
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import {
  LwDictionaryRepository,
  DEFAULT_CATEGORIES,
  DEFAULT_DICTIONARY,
} from '@core/database/repositories/lw-dictionary.repository'

describe.each(getTestDialects())('LwDictionary [%s]', dialect => {
  let tds: TestDataSource
  let repo: LwDictionaryRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new LwDictionaryRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('createCategory + getAllCategories 排序', async () => {
    await repo.createCategory('a', 'A')
    await repo.createCategory('b', 'B')
    const cats = await repo.getAllCategories()
    expect(cats).toHaveLength(2)
    expect(cats[0].sortOrder).toBe(0)
    expect(cats[1].sortOrder).toBe(1)
  })

  it('updateCategory', async () => {
    await repo.createCategory('a', 'old')
    const updated = await repo.updateCategory('a', 'new')
    expect(updated!.name).toBe('new')
  })

  it('deleteCategory 级联删除字典项', async () => {
    await repo.createCategory('a', 'A')
    await repo.create('a', 'k1', 'V1')
    await repo.create('a', 'k2', 'V2')
    expect((await repo.getByCategory('a'))).toHaveLength(2)
    await repo.deleteCategory('a')
    expect(await repo.getCategoryByCode('a')).toBeNull()
    expect((await repo.getByCategory('a'))).toHaveLength(0)
  })

  it('item create/getByCategory/排序', async () => {
    await repo.createCategory('cat', 'CAT')
    await repo.create('cat', 'k1', 'V1')
    await repo.create('cat', 'k2', 'V2')
    const list = await repo.getByCategory('cat')
    expect(list.map(i => i.code)).toEqual(['k1', 'k2'])
  })

  it('getByCode + update', async () => {
    await repo.createCategory('cat', 'CAT')
    const created = await repo.create('cat', 'k1', 'V1')
    const got = await repo.getByCode('cat', 'k1')
    expect(got!.id).toBe(created.id)
    const updated = await repo.update(created.id, { name: 'V2' })
    expect(updated!.name).toBe('V2')
  })

  it('reorder 字典项', async () => {
    await repo.createCategory('cat', 'CAT')
    const i1 = await repo.create('cat', 'k1', 'V1')
    const i2 = await repo.create('cat', 'k2', 'V2')
    const i3 = await repo.create('cat', 'k3', 'V3')
    await repo.reorder('cat', [i3.id, i1.id, i2.id])
    const list = await repo.getByCategory('cat')
    expect(list.map(i => i.code)).toEqual(['k3', 'k1', 'k2'])
  })

  it('initializeDefaults 写入默认分类和字典项 (重复调用幂等)', async () => {
    await repo.initializeDefaults()
    const cats = await repo.getAllCategories()
    expect(cats).toHaveLength(DEFAULT_CATEGORIES.length)
    const all = await repo.getAll()
    for (const code of Object.keys(DEFAULT_DICTIONARY)) {
      expect(all[code]).toHaveLength(DEFAULT_DICTIONARY[code].length)
    }
    // 二次调用：分类不重复创建，字典项不重复创建
    await repo.initializeDefaults()
    expect((await repo.getAllCategories())).toHaveLength(DEFAULT_CATEGORIES.length)
    const all2 = await repo.getAll()
    for (const code of Object.keys(DEFAULT_DICTIONARY)) {
      expect(all2[code]).toHaveLength(DEFAULT_DICTIONARY[code].length)
    }
  })

  it('delete 字典项', async () => {
    await repo.createCategory('cat', 'CAT')
    const it1 = await repo.create('cat', 'k1', 'V1')
    expect(await repo.delete(it1.id)).toBe(true)
    expect(await repo.getById(it1.id)).toBeNull()
  })
})
