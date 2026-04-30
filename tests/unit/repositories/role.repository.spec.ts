import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { RoleRepository } from '@core/database/repositories/role.repository'
import { DialogEntity } from '@core/database/entities/dialog.entity'
import { MessageEntity } from '@core/database/entities/message.entity'

describe.each(getTestDialects())('RoleRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: RoleRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new RoleRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create 写入默认值 + getById 读出 isBuiltin=false', async () => {
    const r = await repo.create({
      name: '测试角色',
      description: 'desc',
      systemPrompt: 'you are X',
    })
    expect(r.isBuiltin).toBe(false)
    expect(r.autoResetModel).toBe(true)
    expect(r.enableStream).toBe(true)
    expect(r.temperature).toBe(0.7)
    expect(r.topP).toBe(1.0)
    expect(r.maxTokens).toBe(4096)
    expect(r.knowledgeRetrieveCount).toBe(5)
    expect(r.knowledgeThreshold).toBe(0.5)

    const got = await repo.getById(r.id)
    expect(got).toEqual(r)
  })

  it('create 显式传入 customParams + knowledgeBaseIds (JSON 列)', async () => {
    const r = await repo.create({
      name: 'JSON',
      customParams: { stop: ['\\n\\n'], extra: { v: 1 } },
      knowledgeBaseIds: ['kb1', 'kb2'],
    })
    const got = await repo.getById(r.id)
    expect(got!.customParams).toEqual({ stop: ['\\n\\n'], extra: { v: 1 } })
    expect(got!.knowledgeBaseIds).toEqual(['kb1', 'kb2'])
  })

  it('createBuiltin 写 isBuiltin=true', async () => {
    const r = await repo.createBuiltin({
      id: 'builtin-1',
      name: '内置',
      description: '',
      systemPrompt: '',
      avatar: '',
    })
    expect(r.isBuiltin).toBe(true)
    expect(r.id).toBe('builtin-1')
  })

  it('getAll 按 is_builtin DESC 后 created_at ASC 排序', async () => {
    const u1 = await repo.create({ name: 'U1' })
    await new Promise(r => setTimeout(r, 5))
    await repo.createBuiltin({
      id: 'b1',
      name: 'B1',
      description: '',
      systemPrompt: '',
      avatar: '',
    })
    await new Promise(r => setTimeout(r, 5))
    const u2 = await repo.create({ name: 'U2' })

    const all = await repo.getAll()
    expect(all).toHaveLength(3)
    expect(all[0].id).toBe('b1') // builtin first
    expect(all[1].id).toBe(u1.id)
    expect(all[2].id).toBe(u2.id)
  })

  it('update 部分字段', async () => {
    const r = await repo.create({ name: 'Old', temperature: 0.5 })
    await repo.update(r.id, {
      name: 'New',
      enableStream: false,
      knowledgeBaseIds: ['k1'],
    })
    const got = await repo.getById(r.id)
    expect(got!.name).toBe('New')
    expect(got!.temperature).toBe(0.5)
    expect(got!.enableStream).toBe(false)
    expect(got!.knowledgeBaseIds).toEqual(['k1'])
  })

  it('delete 内置角色返回 deleted=false', async () => {
    const r = await repo.createBuiltin({
      id: 'builtin-x',
      name: 'BX',
      description: '',
      systemPrompt: '',
      avatar: '',
    })
    const result = await repo.delete(r.id)
    expect(result.deleted).toBe(false)
    expect(result.dialogCount).toBe(0)
  })

  it('delete 自定义角色 + 级联删除关联 dialogs/messages', async () => {
    const r = await repo.create({ name: 'ToDelete' })
    const dialogRepo = tds.ds.getRepository(DialogEntity)
    const messageRepo = tds.ds.getRepository(MessageEntity)

    const d = await dialogRepo.save({
      id: 'd1',
      title: 't',
      modelId: 'm',
      providerConfigId: null,
      roleId: r.id,
      systemPrompt: null,
      contextConfig: null,
      knowledgeBaseIds: null,
      webSearchConfig: null,
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await messageRepo.save({
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

    expect(await repo.getDialogCount(r.id)).toBe(1)

    const result = await repo.delete(r.id)
    expect(result.deleted).toBe(true)
    expect(result.dialogCount).toBe(1)
    expect(await repo.getById(r.id)).toBeNull()
    expect(await dialogRepo.count({ where: { id: 'd1' } as any })).toBe(0)
    expect(await messageRepo.count({ where: { id: 'm1' } as any })).toBe(0)
  })

  it('getDialogCount 统计', async () => {
    const r = await repo.create({ name: 'X' })
    expect(await repo.getDialogCount(r.id)).toBe(0)

    const dialogRepo = tds.ds.getRepository(DialogEntity)
    await dialogRepo.save({
      id: 'd2',
      title: 't',
      modelId: 'm',
      providerConfigId: null,
      roleId: r.id,
      systemPrompt: null,
      contextConfig: null,
      knowledgeBaseIds: null,
      webSearchConfig: null,
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    expect(await repo.getDialogCount(r.id)).toBe(1)
  })

  it('initBuiltinRoles 幂等', async () => {
    await repo.initBuiltinRoles()
    const before = await repo.getAll()
    await repo.initBuiltinRoles()
    const after = await repo.getAll()
    expect(after.length).toBe(before.length)
  })
})
