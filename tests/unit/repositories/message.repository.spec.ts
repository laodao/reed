import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { MessageRepository } from '@core/database/repositories/message.repository'
import { DialogRepository } from '@core/database/repositories/dialog.repository'

describe.each(getTestDialects())('MessageRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: MessageRepository
  let dialogRepo: DialogRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new MessageRepository(tds.ds)
    dialogRepo = new DialogRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create 同步更新 dialog.messageCount + updatedAt', async () => {
    const d = await dialogRepo.create({
      title: 'D',
      modelId: 'm',
      providerConfigId: undefined,
      roleId: null,
      systemPrompt: undefined,
    })
    const before = (await dialogRepo.getById(d.id))!.updatedAt

    await new Promise(r => setTimeout(r, 10))
    const m = await repo.create({
      dialogId: d.id,
      role: 'user',
      content: 'hi',
    })
    expect(m.id).toBeTruthy()
    expect(m.createdAt).toBeInstanceOf(Date)

    const after = await dialogRepo.getById(d.id)
    expect(after!.messageCount).toBe(1)
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before.getTime())
  })

  it('create JSON 列：attachments + metadata', async () => {
    const d = await dialogRepo.create({
      title: 'D',
      modelId: 'm',
      providerConfigId: undefined,
      roleId: null,
      systemPrompt: undefined,
    })
    const m = await repo.create({
      dialogId: d.id,
      role: 'user',
      content: '',
      attachments: [{ type: 'image', url: 'http://x' } as any],
      metadata: { foo: 'bar' } as any,
    })
    const got = await repo.getById(m.id)
    expect(got!.attachments).toEqual([{ type: 'image', url: 'http://x' }])
    expect(got!.metadata).toEqual({ foo: 'bar' })
  })

  it('getByDialogId 按 created_at ASC', async () => {
    const d = await dialogRepo.create({
      title: 'D',
      modelId: 'm',
      providerConfigId: undefined,
      roleId: null,
      systemPrompt: undefined,
    })
    await repo.create({ dialogId: d.id, role: 'user', content: '1' })
    await new Promise(r => setTimeout(r, 5))
    await repo.create({ dialogId: d.id, role: 'assistant', content: '2' })

    const list = await repo.getByDialogId(d.id)
    expect(list).toHaveLength(2)
    expect(list[0].content).toBe('1')
    expect(list[1].content).toBe('2')
  })

  it('getRecent 按 ASC 返回最近 N 条', async () => {
    const d = await dialogRepo.create({
      title: 'D',
      modelId: 'm',
      providerConfigId: undefined,
      roleId: null,
      systemPrompt: undefined,
    })
    for (let i = 0; i < 5; i++) {
      await repo.create({ dialogId: d.id, role: 'user', content: `m${i}` })
      await new Promise(r => setTimeout(r, 3))
    }
    const recent = await repo.getRecent(d.id, 3)
    expect(recent.map(x => x.content)).toEqual(['m2', 'm3', 'm4'])
  })

  it('delete 单条扣减 messageCount', async () => {
    const d = await dialogRepo.create({
      title: 'D',
      modelId: 'm',
      providerConfigId: undefined,
      roleId: null,
      systemPrompt: undefined,
    })
    const m1 = await repo.create({ dialogId: d.id, role: 'user', content: '1' })
    await repo.create({ dialogId: d.id, role: 'assistant', content: '2' })
    expect((await dialogRepo.getById(d.id))!.messageCount).toBe(2)

    await repo.delete(m1.id)
    expect((await dialogRepo.getById(d.id))!.messageCount).toBe(1)
  })

  it('deleteByDialogId 重置 messageCount=0', async () => {
    const d = await dialogRepo.create({
      title: 'D',
      modelId: 'm',
      providerConfigId: undefined,
      roleId: null,
      systemPrompt: undefined,
    })
    await repo.create({ dialogId: d.id, role: 'user', content: '1' })
    await repo.create({ dialogId: d.id, role: 'assistant', content: '2' })
    await repo.deleteByDialogId(d.id)
    expect(await repo.count(d.id)).toBe(0)
    expect((await dialogRepo.getById(d.id))!.messageCount).toBe(0)
  })

  it('updateContent / updateMetadata / updateTokensUsed', async () => {
    const d = await dialogRepo.create({
      title: 'D',
      modelId: 'm',
      providerConfigId: undefined,
      roleId: null,
      systemPrompt: undefined,
    })
    const m = await repo.create({ dialogId: d.id, role: 'user', content: 'old' })
    await repo.updateContent(m.id, 'new')
    await repo.updateMetadata(m.id, { v: 1 } as any)
    await repo.updateTokensUsed(m.id, 100)
    const got = await repo.getById(m.id)
    expect(got!.content).toBe('new')
    expect(got!.metadata).toEqual({ v: 1 })
    expect(got!.tokensUsed).toBe(100)
  })

  it('count 与 getById', async () => {
    const d = await dialogRepo.create({
      title: 'D',
      modelId: 'm',
      providerConfigId: undefined,
      roleId: null,
      systemPrompt: undefined,
    })
    expect(await repo.count(d.id)).toBe(0)
    expect(await repo.getById('nope')).toBeNull()
  })
})
