import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { ApiKeyRepository } from '@core/database/repositories/api-key.repository'

describe.each(getTestDialects())('ApiKeyRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: ApiKeyRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new ApiKeyRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('save 后 get 返回相同值', async () => {
    await repo.save('openai', 'enc-key', 'https://api.example.com')
    const got = await repo.get('openai')
    expect(got).toEqual({
      encryptedKey: 'enc-key',
      endpoint: 'https://api.example.com',
    })
  })

  it('save 不传 endpoint 时 get 返回 endpoint=undefined', async () => {
    await repo.save('anthropic', 'k2')
    const got = await repo.get('anthropic')
    expect(got).toEqual({ encryptedKey: 'k2', endpoint: undefined })
  })

  it('get 不存在的 provider 返回 null', async () => {
    expect(await repo.get('nope')).toBeNull()
  })

  it('save 同 provider 第二次为 update 不是 insert', async () => {
    await repo.save('openai', 'k1')
    await repo.save('openai', 'k2', 'https://x')
    const got = await repo.get('openai')
    expect(got).toEqual({ encryptedKey: 'k2', endpoint: 'https://x' })
  })

  it('exists 返回正确布尔', async () => {
    expect(await repo.exists('openai')).toBe(false)
    await repo.save('openai', 'k')
    expect(await repo.exists('openai')).toBe(true)
  })

  it('delete 后 exists=false', async () => {
    await repo.save('openai', 'k')
    await repo.delete('openai')
    expect(await repo.exists('openai')).toBe(false)
  })

  it('getAll 返回 provider + hasEndpoint 摘要', async () => {
    await repo.save('openai', 'k1', 'https://x')
    await repo.save('anthropic', 'k2')
    const all = await repo.getAll()
    expect(all).toHaveLength(2)
    expect(all).toEqual(
      expect.arrayContaining([
        { provider: 'openai', hasEndpoint: true },
        { provider: 'anthropic', hasEndpoint: false },
      ]),
    )
  })

  it('getAll 空表返回 []', async () => {
    expect(await repo.getAll()).toEqual([])
  })
})
