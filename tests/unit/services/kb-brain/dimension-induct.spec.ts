/**
 * 提炼维度库测试（v3 M1）：种子幂等、启用提示、归纳建议（去重/停用落库/素材不足跳过）、解析收编。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbDimensionRepository } from '@core/database/repositories/kb-dimension.repository'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import {
  KbDimensionInductService,
  parseDimensionProposals,
  SEED_DIMENSIONS,
} from '@core/platform/services/kb-brain/dimension-induct.service'
import { createKbBrainTestTables, insertTestKb } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

describe('提炼维度库（v3 M1）', () => {
  let ds: DataSource
  let dims: KbDimensionRepository
  let notes: KbNoteRepository

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
    await insertTestKb(ds, { id: 'kb-dim' })
    dims = new KbDimensionRepository(ds)
    notes = new KbNoteRepository(ds)
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('种子：首次补齐、二次幂等；enabled 提示可读', async () => {
    const svc = new KbDimensionInductService({ dimensions: dims, notes, events: null })
    const n1 = await svc.ensureSeeded('kb-dim')
    expect(n1).toBe(SEED_DIMENSIONS.length)
    const n2 = await svc.ensureSeeded('kb-dim')
    expect(n2).toBe(0)
    const hints = await svc.enabledHints('kb-dim')
    expect(hints.length).toBe(SEED_DIMENSIONS.length)
    expect(hints[0]).toContain('：')
  })

  it('归纳建议：已有维度去重、新维度停用落库（induced）', async () => {
    await notes.propose('kb-dim', {
      title: '断章三律：情绪未落、信息半露、事态将变',
      description: 'd',
      type: 'synthesis',
    })
    await notes.propose('kb-dim', { title: '情绪潮汐法：张弛交替制造动力', description: 'd', type: 'synthesis' })
    await notes.propose('kb-dim', { title: '信息差引擎：认知错位驱动追更', description: 'd', type: 'synthesis' })
    const svc = new KbDimensionInductService({
      dimensions: dims,
      notes,
      events: null,
      llm: async () =>
        JSON.stringify({
          dimensions: [
            { name: '钩子体系', definition: '重复', hint: '已有维度' },
            { name: '断章艺术', definition: '断点选择与信息截断', hint: '看章末截在什么状态' },
            { name: '', definition: '空名应被剔除' },
          ],
        }),
    })
    const out = await svc.propose('kb-dim')
    expect(out.skipped).toBe(false)
    expect(out.proposed).toBe(1)
    const all = await dims.listAll('kb-dim')
    const dim = all.find((d) => d.name === '断章艺术')!
    expect(dim.source).toBe('induced')
    expect(dim.enabled).toBe(false)
  })

  it('素材不足（synthesis 卡 <3）自跳过，不烧调用', async () => {
    const svc = new KbDimensionInductService({
      dimensions: dims,
      notes,
      events: null,
      llm: async () => {
        throw new Error('不应调用')
      },
    })
    const out = await svc.propose('kb-dim-empty')
    expect(out.skipped).toBe(true)
    expect(out.reason).toContain('素材不足')
  })

  it('parseDimensionProposals：非字符串名/超长名剔除', () => {
    const out = parseDimensionProposals(
      JSON.stringify({
        dimensions: [
          { name: '合理维度', definition: 'd', hint: 'h' },
          { name: '', definition: 'd' },
          { name: 'x'.repeat(21), definition: 'd' },
          'junk',
        ],
      }),
    )
    expect(out).toEqual([{ name: '合理维度', definition: 'd', hint: 'h' }])
  })
})
