/**
 * 消费记账测试（v3 M3 #12）：入账字段、listRecent、countByTool、fail-soft。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbConsumptionLogRepository } from '@core/database/repositories/kb-consumption-log.repository'
import { recordConsumption } from '@core/platform/services/kb-brain/consumption-log.service'
import { createKbBrainTestTables, insertTestKb } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

describe('消费记账（v3 M3 #12）', () => {
  let ds: DataSource
  let logs: KbConsumptionLogRepository

  beforeAll(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: Object.values(entities).filter((v) => typeof v === 'function') as EntityCtor[],
      synchronize: false,
      logging: false,
    })
    await ds.initialize()
    await createKbBrainTestTables(ds)
    await insertTestKb(ds, { id: 'kb-cl' })
    logs = new KbConsumptionLogRepository(ds)
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('record + listRecent + countByTool：字段齐、taskExcerpt 截 120', async () => {
    await logs.record({ knowledgeBaseId: 'kb-cl', tool: 'tool', mode: 'outline', taskExcerpt: 'x'.repeat(300), packChars: 3200 })
    await logs.record({ knowledgeBaseId: 'kb-cl', tool: 'writing', mode: 'scene', sceneType: 'probe', taskExcerpt: '师长核查场面取材', packChars: 2100 })
    const rows = await logs.listRecent('kb-cl', 10)
    expect(rows.length).toBe(2)
    expect(rows[0]!.tool).toBe('writing')
    expect(rows[0]!.sceneType).toBe('probe')
    const first = rows.find((r) => r.tool === 'tool')!
    expect(first.mode).toBe('outline')
    expect(first.taskExcerpt.length).toBeLessThanOrEqual(120)
    const counts = await logs.countByTool('kb-cl')
    expect(counts).toEqual({ tool: 1, writing: 1 })
  })

  it('recordConsumption 无 manager 环境 fail-soft 不抛；仓储对坏库 id 同样不抛', async () => {
    await expect(
      recordConsumption({ knowledgeBaseId: 'no-such-kb', tool: 'tool', mode: 'scene' })
    ).resolves.toBeUndefined()
    await expect(logs.record({ knowledgeBaseId: 'no-such-kb', tool: 'tool', mode: 'scene' })).resolves.toBeUndefined()
  })
})
