import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { DialogRepository } from '@core/database/repositories/dialog.repository'
import { MessageEntity } from '@core/database/entities/message.entity'

const baseDialog = (over: any = {}) => ({
  title: 'D1',
  modelId: 'gpt-4',
  providerConfigId: undefined,
  roleId: null,
  systemPrompt: undefined,
  contextConfig: undefined,
  knowledgeBaseIds: undefined,
  webSearchConfig: undefined,
  ...over,
})

describe.each(getTestDialects())('DialogRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: DialogRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new DialogRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + getById：默认助手 roleId=null', async () => {
    const d = await repo.create(baseDialog())
    expect(d.roleId).toBeNull()
    expect(d.messageCount).toBe(0)
    expect(d.createdAt).toBeInstanceOf(Date)

    const got = await repo.getById(d.id)
    expect(got).toEqual(d)
  })

  it('JSON 列往返：contextConfig + knowledgeBaseIds + webSearchConfig', async () => {
    const d = await repo.create(
      baseDialog({
        contextConfig: { mode: 'short', maxTokens: 1000 },
        knowledgeBaseIds: ['kb1', 'kb2'],
        webSearchConfig: { provider: 'google', enabled: true },
      }),
    )
    const got = await repo.getById(d.id)
    expect(got!.contextConfig).toEqual({ mode: 'short', maxTokens: 1000 })
    expect(got!.knowledgeBaseIds).toEqual(['kb1', 'kb2'])
    expect(got!.webSearchConfig).toEqual({ provider: 'google', enabled: true })
  })

  it('roleId="default-assistant" 兼容处理读出 null', async () => {
    // 直接通过 entity 写入旧值（模拟历史数据）
    const dialogRepo = tds.ds.getRepository(
      (await import('@core/database/entities/dialog.entity')).DialogEntity,
    )
    await dialogRepo.save({
      id: 'old-1',
      title: 'old',
      modelId: 'm',
      providerConfigId: null,
      roleId: 'default-assistant',
      systemPrompt: null,
      contextConfig: null,
      knowledgeBaseIds: null,
      webSearchConfig: null,
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const got = await repo.getById('old-1')
    expect(got!.roleId).toBeNull()
  })

  it('getByRoleId(null) 返回 NULL 或 "default-assistant"', async () => {
    await repo.create(baseDialog({ title: 'A', roleId: null }))
    const dialogRepo = tds.ds.getRepository(
      (await import('@core/database/entities/dialog.entity')).DialogEntity,
    )
    await dialogRepo.save({
      id: 'B',
      title: 'B',
      modelId: 'm',
      providerConfigId: null,
      roleId: 'default-assistant',
      systemPrompt: null,
      contextConfig: null,
      knowledgeBaseIds: null,
      webSearchConfig: null,
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await repo.create(baseDialog({ title: 'C', roleId: 'role-x' }))
    const list = await repo.getByRoleId(null)
    expect(list).toHaveLength(2)
    expect(list.map(x => x.title).sort()).toEqual(['A', 'B'])
  })

  it('getByRoleId 指定 ID 仅返回该角色的对话', async () => {
    await repo.create(baseDialog({ title: 'A', roleId: 'r1' }))
    await repo.create(baseDialog({ title: 'B', roleId: 'r1' }))
    await repo.create(baseDialog({ title: 'C', roleId: 'r2' }))
    const list = await repo.getByRoleId('r1')
    expect(list).toHaveLength(2)
  })

  it('update 部分字段', async () => {
    const d = await repo.create(baseDialog({ title: 'old' }))
    await repo.update(d.id, { title: 'new', knowledgeBaseIds: ['k1'] })
    const got = await repo.getById(d.id)
    expect(got!.title).toBe('new')
    expect(got!.knowledgeBaseIds).toEqual(['k1'])
  })

  it('delete 级联删除关联 messages', async () => {
    const d = await repo.create(baseDialog())
    const msgRepo = tds.ds.getRepository(MessageEntity)
    await msgRepo.save({
      id: 'm1',
      dialogId: d.id,
      role: 'user',
      content: 'hi',
      modelId: null,
      tokensUsed: null,
      attachments: null,
      metadata: null,
      createdAt: new Date(),
    })
    await msgRepo.save({
      id: 'm2',
      dialogId: d.id,
      role: 'assistant',
      content: 'hello',
      modelId: null,
      tokensUsed: null,
      attachments: null,
      metadata: null,
      createdAt: new Date(),
    })

    await repo.delete(d.id)
    expect(await repo.getById(d.id)).toBeNull()
    expect(await msgRepo.count({ where: { dialogId: d.id } as any })).toBe(0)
  })

  it('updateMessageCount + touch 更新 updatedAt', async () => {
    const d = await repo.create(baseDialog())
    const beforeUpdated = d.updatedAt
    await new Promise(r => setTimeout(r, 10))
    await repo.updateMessageCount(d.id, 5)
    const got1 = await repo.getById(d.id)
    expect(got1!.messageCount).toBe(5)
    expect(got1!.updatedAt.getTime()).toBeGreaterThan(beforeUpdated.getTime())

    await new Promise(r => setTimeout(r, 10))
    await repo.touch(d.id)
    const got2 = await repo.getById(d.id)
    expect(got2!.updatedAt.getTime()).toBeGreaterThan(got1!.updatedAt.getTime())
  })

  it('getAll 按 updatedAt DESC', async () => {
    const a = await repo.create(baseDialog({ title: 'A' }))
    await new Promise(r => setTimeout(r, 5))
    const b = await repo.create(baseDialog({ title: 'B' }))
    await new Promise(r => setTimeout(r, 5))
    await repo.touch(a.id)
    const all = await repo.getAll()
    expect(all.map(x => x.id)).toEqual([a.id, b.id])
  })
})
