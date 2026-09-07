import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { OSSConfigRepository } from '@core/database/repositories/oss-config.repository'

const fixture = (over: any = {}) => ({
  id: `oss_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
  name: 'AliyunOSS-1',
  provider: 'aliyun' as any,
  accessKeyId: 'AK',
  accessKeySecret: 'SK',
  region: 'cn-shanghai',
  bucket: 'my-bucket',
  ...over,
})

describe.each(getTestDialects())('OSSConfigRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: OSSConfigRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new OSSConfigRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + getById + bigint epoch ms', async () => {
    const c = await repo.create(fixture() as any)
    expect(c.isEnabled).toBe(true)
    expect(c.isDefault).toBe(false)
    expect(typeof c.createdAt).toBe('number')

    const got = await repo.getById(c.id)
    expect(got!.name).toBe('AliyunOSS-1')
  })

  it('getAll 排序 is_default DESC, created_at DESC', async () => {
    await repo.create(fixture({ id: 'a', name: 'A' }) as any)
    await new Promise(r => setTimeout(r, 5))
    const b = await repo.create(fixture({ id: 'b', name: 'B' }) as any)
    await repo.setDefault(b.id)

    const all = await repo.getAll()
    expect(all[0].id).toBe(b.id)
  })

  it('setDefault 单例：清除其他默认', async () => {
    const a = await repo.create(fixture({ id: 'a', name: 'A' }) as any)
    const b = await repo.create(fixture({ id: 'b', name: 'B' }) as any)
    await repo.setDefault(a.id)
    expect((await repo.getById(a.id))!.isDefault).toBe(true)
    await repo.setDefault(b.id)
    expect((await repo.getById(a.id))!.isDefault).toBe(false)
    expect((await repo.getById(b.id))!.isDefault).toBe(true)
  })

  it('getEnabled 仅返回 isEnabled=true + getDefault 命中', async () => {
    await repo.create(fixture({ id: 'a' }) as any)
    const b = await repo.create(fixture({ id: 'b' }) as any)
    await repo.toggleEnabled(b.id)
    expect((await repo.getEnabled()).length).toBe(1)

    await repo.setDefault('a')
    const def = await repo.getDefault()
    expect(def!.id).toBe('a')
  })

  it('getDefault 无默认标记时：单条启用回退、多条启用返回 null', async () => {
    // 仅一条启用且未标记默认 → 回退返回该条
    await repo.create(fixture({ id: 'single' }) as any)
    const single = await repo.getDefault()
    expect(single?.id).toBe('single')

    // 两条启用且都未标记默认 → 返回 null（避免误选）
    await repo.create(fixture({ id: 'another' }) as any)
    expect(await repo.getDefault()).toBeNull()

    // 标记默认后命中默认
    await repo.setDefault('another')
    expect((await repo.getDefault())!.id).toBe('another')
  })

  it('update 空 accessKeyId / accessKeySecret 不清空已有密钥', async () => {
    const c = await repo.create(fixture({ id: 'a' }) as any)
    await repo.update('a', { name: '改名', accessKeyId: '', accessKeySecret: '' } as any)
    const got = await repo.getById(c.id)!
    expect(got!.name).toBe('改名')
    expect(got!.accessKeyId).toBe('AK')
    expect(got!.accessKeySecret).toBe('SK')

    // 提供新值时正常更新
    await repo.update('a', { accessKeyId: 'AK2', accessKeySecret: 'SK2' } as any)
    const got2 = await repo.getById(c.id)!
    expect(got2!.accessKeyId).toBe('AK2')
    expect(got2!.accessKeySecret).toBe('SK2')
  })

  it('update + delete + toggleEnabled', async () => {
    const c = await repo.create(fixture({ id: 'a' }) as any)
    expect(await repo.update(c.id, { name: 'New' } as any)).toBe(true)
    expect((await repo.getById(c.id))!.name).toBe('New')

    expect(await repo.toggleEnabled(c.id)).toBe(true)
    expect((await repo.getById(c.id))!.isEnabled).toBe(false)

    expect(await repo.delete(c.id)).toBe(true)
    expect(await repo.getById(c.id)).toBeNull()
  })
})
