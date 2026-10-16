/**
 * 邮箱账号仓库测试（评审 #16 回归）
 * @module tests/repositories/email-account.repository
 * @description 核心断言：passEnc 密文绝不出现在任何 DTO（list/findById/create/update 返回值），
 *              服务层连接前解密走 getRawById 取原始实体；编辑留空 pass 保留原密文。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { EmailAccountRepository } from '@core/database/repositories/email-account.repository'

describe.each(getTestDialects())('EmailAccountRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: EmailAccountRepository

  const baseInput = {
    name: '测试邮箱',
    imapHost: 'imap.example.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.example.com',
    smtpPort: 465,
    smtpSecure: true,
    user: 'alice@example.com',
    passEnc: 'enc-cipher-v1',
    fromName: 'Alice',
  }

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new EmailAccountRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create 返回的 DTO 不含 passEnc，含 hasPassword=true', async () => {
    const dto = await repo.create(baseInput)
    expect(dto.hasPassword).toBe(true)
    expect('passEnc' in dto).toBe(false)
    expect((dto as Record<string, unknown>).passEnc).toBeUndefined()
  })

  it('getRawById 返回原始实体（含密文），供服务层解密', async () => {
    const dto = await repo.create(baseInput)
    const raw = await repo.getRawById(dto.id)
    expect(raw).not.toBeNull()
    expect(raw!.passEnc).toBe('enc-cipher-v1')
  })

  it('findById/list 的 DTO 均不含 passEnc', async () => {
    const created = await repo.create(baseInput)
    await repo.create({ ...baseInput, name: '第二个' })
    const one = await repo.findById(created.id)
    expect(one).not.toBeNull()
    expect((one as Record<string, unknown>).passEnc).toBeUndefined()
    expect(one!.hasPassword).toBe(true)
    const list = await repo.list()
    expect(list).toHaveLength(2)
    for (const r of list) {
      expect((r as Record<string, unknown>).passEnc).toBeUndefined()
      expect(r.hasPassword).toBe(true)
    }
  })

  it('编辑未传 passEnc → 保留原密文（编辑留空密码语义）', async () => {
    const created = await repo.create(baseInput)
    await repo.update(created.id, { name: '改名' })
    const raw = await repo.getRawById(created.id)
    expect(raw!.passEnc).toBe('enc-cipher-v1')
  })

  it('编辑传入新 passEnc → 覆盖；DTO 仍不含密文', async () => {
    const created = await repo.create(baseInput)
    const updated = await repo.update(created.id, { passEnc: 'enc-cipher-v2' })
    expect(updated).not.toBeNull()
    expect((updated as Record<string, unknown>).passEnc).toBeUndefined()
    const raw = await repo.getRawById(created.id)
    expect(raw!.passEnc).toBe('enc-cipher-v2')
  })
})
