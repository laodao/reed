/**
 * LW 批次 2：lw-design-message / lw-global-settings / lw-prewrite
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { LwDesignMessageRepository } from '@core/database/repositories/lw-design-message.repository'
import { LwGlobalSettingsRepository } from '@core/database/repositories/lw-global-settings.repository'
import { LwPrewriteRepository } from '@core/database/repositories/lw-prewrite.repository'
import { LwDesignConversationEntity } from '@core/database/entities/lw-design-conversation.entity'

describe.each(getTestDialects())('LW Batch 2 [%s]', dialect => {
  let tds: TestDataSource
  let messages: LwDesignMessageRepository
  let globals: LwGlobalSettingsRepository
  let prewrites: LwPrewriteRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    messages = new LwDesignMessageRepository(tds.ds)
    globals = new LwGlobalSettingsRepository(tds.ds)
    prewrites = new LwPrewriteRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  // ============ DesignMessage ============

  it('Message: add 自动 sort_order 递增', async () => {
    const m1 = await messages.add('c1', { role: 'user', content: 'hi' } as any)
    expect(m1.timestamp).toBeGreaterThan(0)
    await messages.add('c1', { role: 'assistant', content: 'hello' } as any)
    expect(await messages.countByConversationId('c1')).toBe(2)
  })

  it('Message: batchAdd 事务 + 顺序保留', async () => {
    await messages.batchAdd('c1', [
      { role: 'user', content: '1', timestamp: 100 },
      { role: 'assistant', content: '2', timestamp: 200 },
      { role: 'user', content: '3', timestamp: 300 },
    ])
    const list = await messages.getByConversationId('c1')
    expect(list.map(m => m.content)).toEqual(['1', '2', '3'])
  })

  it('Message: replaceAll 删旧加新', async () => {
    await messages.add('c1', { role: 'user', content: 'old' } as any)
    await messages.replaceAll('c1', [
      { role: 'user', content: 'new1', timestamp: 1 },
      { role: 'assistant', content: 'new2', timestamp: 2 },
    ])
    const list = await messages.getByConversationId('c1')
    expect(list.map(m => m.content)).toEqual(['new1', 'new2'])
  })

  it('Message: deleteByConversationId 计数', async () => {
    await messages.add('c1', { role: 'user', content: '1' } as any)
    await messages.add('c1', { role: 'user', content: '2' } as any)
    expect(await messages.deleteByConversationId('c1')).toBe(2)
    expect(await messages.countByConversationId('c1')).toBe(0)
  })

  it('Message: migrateFromJson', async () => {
    const convRepo = tds.ds.getRepository(LwDesignConversationEntity)
    await convRepo.save({
      id: 'c1',
      projectId: 'p1',
      stage: 'overview',
      messages: JSON.stringify([
        { role: 'user', content: 'a', timestamp: 1 },
        { role: 'assistant', content: 'b', timestamp: 2 },
      ]),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const count = await messages.migrateFromJson('c1')
    expect(count).toBe(2)
    expect(await messages.countByConversationId('c1')).toBe(2)
  })

  // ============ GlobalSettings ============

  it('GlobalSettings: getOrCreate 默认值', async () => {
    const s = await globals.getOrCreate()
    expect(s.id).toBe('global_settings')
    expect(s.storyTypes.length).toBeGreaterThan(0)
    expect(s.styles.length).toBeGreaterThan(0)
  })

  it('GlobalSettings: getOrCreate 幂等（不重复创建）', async () => {
    const a = await globals.getOrCreate()
    const b = await globals.getOrCreate()
    expect(a.createdAt).toBe(b.createdAt)
  })

  it('GlobalSettings: update 部分字段', async () => {
    await globals.getOrCreate()
    await globals.update({
      styles: ['新风格1', '新风格2'] as any,
    })
    const got = await globals.get()
    expect(got!.styles).toEqual(['新风格1', '新风格2'])
  })

  // ============ Prewrite ============

  it('Prewrite: create + getByOutlineId', async () => {
    const p = await prewrites.create({
      outlineId: 'o1', content: 'pre',
    } as any)
    expect(p.isConfirmed).toBe(false)
    expect(p.confirmedAt).toBeUndefined()
    const got = await prewrites.getByOutlineId('o1')
    expect(got!.id).toBe(p.id)
  })

  it('Prewrite: confirm/unconfirm', async () => {
    await prewrites.create({ outlineId: 'o1', content: 'x' } as any)
    const c = await prewrites.confirm('o1')
    expect(c!.isConfirmed).toBe(true)
    expect(c!.confirmedAt).toBeGreaterThan(0)
    const u = await prewrites.unconfirm('o1')
    expect(u!.isConfirmed).toBe(false)
    expect(u!.confirmedAt).toBeUndefined()
  })

  it('Prewrite: save upsert', async () => {
    const a = await prewrites.save({ outlineId: 'o1', content: 'v1' } as any)
    const b = await prewrites.save({ outlineId: 'o1', content: 'v2' } as any)
    expect(b.id).toBe(a.id)
    expect(b.content).toBe('v2')
  })

  it('Prewrite: getByOutlineIds Map', async () => {
    await prewrites.create({ outlineId: 'o1', content: 'a' } as any)
    await prewrites.create({ outlineId: 'o2', content: 'b' } as any)
    const map = await prewrites.getByOutlineIds(['o1', 'o2', 'o3'])
    expect(map.size).toBe(2)
    expect(map.get('o1')!.content).toBe('a')
  })
})
