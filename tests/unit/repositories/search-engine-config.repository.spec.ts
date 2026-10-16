import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { SearchEngineConfigRepository } from '@core/database/repositories/search-engine-config.repository'

const fixture = (over: Partial<{
  templateId: any
  name: string
  apiKey?: string
  extraConfig?: Record<string, unknown>
  maxResults: number
  isEnabled: boolean
  isDefault: boolean
  lastTested?: string
  testResult?: 'success' | 'failed' | 'unknown'
}> = {}) => ({
  templateId: 'google' as any,
  name: 'Google',
  apiKey: 'enc-key',
  extraConfig: { engine: 'cse', cx: 'abc' },
  maxResults: 10,
  isEnabled: true,
  isDefault: false,
  ...over,
})

describe.each(getTestDialects())('SearchEngineConfigRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: SearchEngineConfigRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new SearchEngineConfigRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create 后 getById 返回完整数据（含 JSON extraConfig）', async () => {
    const created = await repo.create(fixture())
    expect(created.id).toBeTruthy()
    expect(created.createdAt).toBeTruthy()
    expect(created.updatedAt).toBeTruthy()

    const got = await repo.getById(created.id)
    expect(got).toBeTruthy()
    expect(got!.name).toBe('Google')
    expect(got!.apiKey).toBe('enc-key')
    expect(got!.extraConfig).toEqual({ engine: 'cse', cx: 'abc' })
    expect(got!.maxResults).toBe(10)
    expect(got!.isEnabled).toBe(true)
    expect(got!.isDefault).toBe(false)
  })

  it('getAll 按 is_default DESC, created_at ASC 排序', async () => {
    await repo.create(fixture({ name: 'A', isDefault: false }))
    await new Promise(r => setTimeout(r, 5))
    const second = await repo.create(fixture({ name: 'B', isDefault: true }))
    await new Promise(r => setTimeout(r, 5))
    await repo.create(fixture({ name: 'C', isDefault: false }))

    const all = await repo.getAll()
    expect(all).toHaveLength(3)
    expect(all[0].id).toBe(second.id) // 默认在前
  })

  it('getById 不存在返回 null', async () => {
    expect(await repo.getById('nope')).toBeNull()
  })

  it('update 部分字段，未提及字段不变', async () => {
    const created = await repo.create(fixture({ name: 'Old', maxResults: 5 }))
    const updated = await repo.update(created.id, { name: 'New' })
    expect(updated).toBeTruthy()
    expect(updated!.name).toBe('New')
    expect(updated!.maxResults).toBe(5)
    expect(updated!.extraConfig).toEqual({ engine: 'cse', cx: 'abc' })
  })

  it('update 不存在的 id 返回 null', async () => {
    expect(await repo.update('nope', { name: 'X' })).toBeNull()
  })

  it('delete 后 getById 返回 null', async () => {
    const created = await repo.create(fixture())
    expect(await repo.delete(created.id)).toBe(true)
    expect(await repo.getById(created.id)).toBeNull()
  })

  it('delete 不存在的 id 返回 false', async () => {
    expect(await repo.delete('nope')).toBe(false)
  })

  it('setDefault 把指定行设为默认，其他行清除默认', async () => {
    const a = await repo.create(fixture({ name: 'A', isDefault: true }))
    const b = await repo.create(fixture({ name: 'B', isDefault: false }))

    expect(await repo.setDefault(b.id)).toBe(true)

    const allAfter = await repo.getAll()
    const aAfter = allAfter.find(x => x.id === a.id)!
    const bAfter = allAfter.find(x => x.id === b.id)!
    expect(aAfter.isDefault).toBe(false)
    expect(bAfter.isDefault).toBe(true)
  })

  it('getDefault 返回唯一默认且启用的配置', async () => {
    await repo.create(fixture({ name: 'A', isDefault: false, isEnabled: true }))
    const b = await repo.create(
      fixture({ name: 'B', isDefault: true, isEnabled: true }),
    )
    await repo.create(fixture({ name: 'C', isDefault: false, isEnabled: false }))

    const def = await repo.getDefault()
    expect(def!.id).toBe(b.id)
  })

  it('getEnabled 只返回 isEnabled=true 的行', async () => {
    await repo.create(fixture({ name: 'A', isEnabled: true }))
    await repo.create(fixture({ name: 'B', isEnabled: false }))
    const enabled = await repo.getEnabled()
    expect(enabled).toHaveLength(1)
    expect(enabled[0].name).toBe('A')
  })

  it('getByTemplateId 过滤 templateId', async () => {
    await repo.create(fixture({ templateId: 'google' as any }))
    await repo.create(fixture({ templateId: 'bing' as any }))
    const list = await repo.getByTemplateId('google' as any)
    expect(list).toHaveLength(1)
  })

  it('updateTestResult 写 last_tested + test_result', async () => {
    const created = await repo.create(fixture())
    expect(await repo.updateTestResult(created.id, 'success')).toBe(true)
    const got = await repo.getById(created.id)
    expect(got!.testResult).toBe('success')
    expect(got!.lastTested).toBeTruthy()
  })
})
