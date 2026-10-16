import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { DataSourceRepository } from '@core/database/repositories/datasource.repository'

const fixture = (over: any = {}) => ({
  id: `ds_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
  name: '金融业务库',
  driver: 'postgres',
  host: 'db.internal',
  port: 5432,
  database: 'finance',
  username: 'svc',
  passwordEnc: 'enc:abc123',
  ssl: false,
  ...over,
})

describe.each(getTestDialects())('DataSourceRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: DataSourceRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new DataSourceRepository(tds.ds)
    await repo.initTable()
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + getById + bigint epoch ms + 默认启用', async () => {
    const c = await repo.create(fixture() as any)
    expect(c.isEnabled).toBe(true)
    expect(c.ssl).toBe(false)
    expect(typeof c.createdAt).toBe('number')

    const got = await repo.getById(c.id)
    expect(got!.name).toBe('金融业务库')
    expect(got!.passwordEnc).toBe('enc:abc123')
  })

  it('getAll 排序 is_enabled DESC, created_at DESC', async () => {
    await repo.create(fixture({ id: 'a', name: 'A' }) as any)
    await new Promise(r => setTimeout(r, 5))
    const b = await repo.create(fixture({ id: 'b', name: 'B' }) as any)
    await repo.toggleEnabled(b.id)

    const all = await repo.getAll()
    expect(all[0].id).toBe('a') // a 仍启用，排最前
  })

  it('getEnabled 仅返回启用项', async () => {
    await repo.create(fixture({ id: 'a' }) as any)
    const b = await repo.create(fixture({ id: 'b' }) as any)
    await repo.toggleEnabled(b.id)
    const enabled = await repo.getEnabled()
    expect(enabled.map(e => e.id)).toContain('a')
    expect(enabled.map(e => e.id)).not.toContain('b')
  })

  it('update: 改字段 + 密码密文 + 启用开关', async () => {
    const c = await repo.create(fixture({ id: 'a' }) as any)
    expect(await repo.update(c.id, {
      name: 'NewName',
      passwordEnc: 'enc:xyz',
      isEnabled: false,
    } as any)).toBe(true)
    const got = await repo.getById(c.id)!
    expect(got!.name).toBe('NewName')
    expect(got!.passwordEnc).toBe('enc:xyz')
    expect(got!.isEnabled).toBe(false)
  })

  it('delete + toggleEnabled', async () => {
    const c = await repo.create(fixture({ id: 'a' }) as any)
    expect(await repo.toggleEnabled(c.id)).toBe(true)
    expect((await repo.getById(c.id))!.isEnabled).toBe(false)
    expect(await repo.delete(c.id)).toBe(true)
    expect(await repo.getById(c.id)).toBeNull()
  })
})
