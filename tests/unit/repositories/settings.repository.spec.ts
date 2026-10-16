import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { SettingsRepository } from '@core/database/repositories/settings.repository'

describe.each(getTestDialects())('SettingsRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: SettingsRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new SettingsRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('set 后 get 返回 JSON 反序列化的值', async () => {
    await repo.set('theme', 'dark')
    expect(await repo.get('theme')).toBe('dark')
  })

  it('set 复杂对象 → get 返回深相等', async () => {
    const cfg = { font: 'noto', size: 14, nested: { a: [1, 2, 3] } }
    await repo.set('uiCfg', cfg)
    expect(await repo.get('uiCfg')).toEqual(cfg)
  })

  it('set boolean / number / null 都能往返', async () => {
    await repo.set('flag', true)
    await repo.set('count', 42)
    await repo.set('val', null)
    expect(await repo.get('flag')).toBe(true)
    expect(await repo.get('count')).toBe(42)
    expect(await repo.get('val')).toBeNull()
  })

  it('get 不存在的 key 返回 null', async () => {
    expect(await repo.get('nope')).toBeNull()
  })

  it('set 同 key 第二次为 upsert', async () => {
    await repo.set('theme', 'light')
    await repo.set('theme', 'dark')
    expect(await repo.get('theme')).toBe('dark')
  })

  it('getAll 返回所有键值映射（值已反序列化）', async () => {
    await repo.set('a', 1)
    await repo.set('b', 'two')
    await repo.set('c', { nested: true })
    const all = await repo.getAll()
    expect(all).toEqual({ a: 1, b: 'two', c: { nested: true } })
  })

  it('getAll 空表返回 {}', async () => {
    expect(await repo.getAll()).toEqual({})
  })

  it('delete 后 get 返回 null', async () => {
    await repo.set('foo', 'bar')
    await repo.delete('foo')
    expect(await repo.get('foo')).toBeNull()
  })
})
