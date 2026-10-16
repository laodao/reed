import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { ProviderConfigRepository } from '@core/database/repositories/provider-config.repository'

const fixture = (over: any = {}) => ({
  templateId: 'openai',
  name: 'My OpenAI',
  apiKey: 'enc-key',
  baseUrl: 'https://api.openai.com',
  isEnabled: true,
  isDefault: false,
  ...over,
})

describe.each(getTestDialects())('ProviderConfigRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: ProviderConfigRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new ProviderConfigRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + getById：基本 + JSON + ISO 时间字段', async () => {
    const c = await repo.create(
      fixture({
        customHeaders: { 'X-Foo': 'bar' },
        customParams: { temp: 0.7 },
        models: [{ id: 'gpt-4', name: 'GPT-4' }],
      }),
    )
    expect(c.id).toBeTruthy()
    expect(typeof c.createdAt).toBe('string')

    const got = await repo.getById(c.id)
    expect(got!.customHeaders).toEqual({ 'X-Foo': 'bar' })
    expect(got!.customParams).toEqual({ temp: 0.7 })
    expect(got!.models).toEqual([{ id: 'gpt-4', name: 'GPT-4' }])
  })

  it('create 加密字段（apiKey/accessKeySecret）映射到 *_encrypted 列', async () => {
    const c = await repo.create(
      fixture({
        apiKey: 'sk-enc',
        accessKeyId: 'AKID',
        accessKeySecret: 'SK-enc',
      }),
    )
    const got = await repo.getById(c.id)
    expect(got!.apiKey).toBe('sk-enc')
    expect(got!.accessKeyId).toBe('AKID')
    expect(got!.accessKeySecret).toBe('SK-enc')
  })

  it('isDefault=true 创建会清除其他默认', async () => {
    const a = await repo.create(fixture({ name: 'A', isDefault: true }))
    const b = await repo.create(fixture({ name: 'B', isDefault: true }))

    const aAfter = await repo.getById(a.id)
    const bAfter = await repo.getById(b.id)
    expect(aAfter!.isDefault).toBe(false)
    expect(bAfter!.isDefault).toBe(true)
  })

  it('getAll 排序 is_default DESC, created_at ASC', async () => {
    await repo.create(fixture({ name: 'A', isDefault: false }))
    await new Promise(r => setTimeout(r, 5))
    const def = await repo.create(fixture({ name: 'B', isDefault: true }))
    await new Promise(r => setTimeout(r, 5))
    await repo.create(fixture({ name: 'C', isDefault: false }))

    const all = await repo.getAll()
    expect(all[0].id).toBe(def.id)
  })

  it('update 部分字段 + setDefault', async () => {
    const c = await repo.create(fixture({ name: 'Old' }))
    const updated = await repo.update(c.id, { name: 'New' })
    expect(updated!.name).toBe('New')

    const c2 = await repo.create(fixture({ name: 'Other', isDefault: true }))
    expect(await repo.setDefault(c.id)).toBe(true)
    expect((await repo.getById(c.id))!.isDefault).toBe(true)
    expect((await repo.getById(c2.id))!.isDefault).toBe(false)
  })

  it('getDefault 返回唯一 default+enabled', async () => {
    await repo.create(fixture({ name: 'A', isDefault: true, isEnabled: false }))
    const b = await repo.create(
      fixture({ name: 'B', isDefault: true, isEnabled: true }),
    )
    const def = await repo.getDefault()
    expect(def!.id).toBe(b.id)
  })

  it('getEnabled 仅返回 isEnabled=true', async () => {
    await repo.create(fixture({ name: 'A', isEnabled: true }))
    await repo.create(fixture({ name: 'B', isEnabled: false }))
    const list = await repo.getEnabled()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('A')
  })

  it('getByTemplateId 过滤', async () => {
    await repo.create(fixture({ templateId: 'openai' }))
    await repo.create(fixture({ templateId: 'anthropic' }))
    expect((await repo.getByTemplateId('openai')).length).toBe(1)
    expect((await repo.getByTemplateId('anthropic')).length).toBe(1)
  })

  it('updateTestResult 写 last_tested + test_result', async () => {
    const c = await repo.create(fixture())
    expect(await repo.updateTestResult(c.id, 'success')).toBe(true)
    const got = await repo.getById(c.id)
    expect(got!.testResult).toBe('success')
    expect(got!.lastTested).toBeTruthy()
  })

  it('delete 不存在返回 false', async () => {
    expect(await repo.delete('nope')).toBe(false)
  })
})
