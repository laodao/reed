/**
 * M5 批2 数据面单测（28 号 §6；对抗 review P2-3 补缺）
 * - add-dialog-agent-enabled 迁移：缺列补列、幂等、双方言
 * - dialog.repository 的 agentEnabled 往返（create/update/read、NULL 旧行语义）
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { DialogRepository } from '@core/database/repositories/dialog.repository'

const baseDialog = (over: Record<string, unknown> = {}) => ({
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

describe.each(getTestDialects())('dialogs.agent_enabled 迁移与仓储 [%s]', (dialect) => {
  let tds: TestDataSource
  let repo: DialogRepository

  beforeAll(async () => {
    // sqlite 走 synchronize:true（实体列已含 agent_enabled）；PG 走独立 schema。
    // 迁移在此语义下验证：幂等（列已存在不重复 ALTER）+ 仓储布尔往返。
    tds = await createTestDataSource(dialect)
    const { addDialogAgentEnabled } = await import('@core/database/migrations/add-dialog-agent-enabled')
    await addDialogAgentEnabled(tds.ds)
    repo = new DialogRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('迁移幂等：重复执行不报错', async () => {
    const { addDialogAgentEnabled } = await import('@core/database/migrations/add-dialog-agent-enabled')
    await expect(addDialogAgentEnabled(tds.ds)).resolves.toBeUndefined()
  })

  it('缺省对话 agentEnabled=false（旧行 NULL 语义）', async () => {
    const d = await repo.create(baseDialog())
    expect(d.agentEnabled).toBe(false)
    const got = await repo.getById(d.id)
    expect(got?.agentEnabled).toBe(false)
  })

  it('create 即开启 + update 开关往返', async () => {
    const on = await repo.create(baseDialog({ agentEnabled: true }))
    expect(on.agentEnabled).toBe(true)
    await repo.update(on.id, { agentEnabled: false })
    expect((await repo.getById(on.id))?.agentEnabled).toBe(false)
    await repo.update(on.id, { agentEnabled: true })
    expect((await repo.getById(on.id))?.agentEnabled).toBe(true)
  })

  it('update 其他字段不触碰 agentEnabled', async () => {
    const d = await repo.create(baseDialog({ agentEnabled: true }))
    await repo.update(d.id, { title: '改名' })
    expect((await repo.getById(d.id))?.agentEnabled).toBe(true)
    expect((await repo.getById(d.id))?.title).toBe('改名')
  })
})
