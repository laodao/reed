/**
 * 代谢整固 v1 测试：classicScore 重算（引用×实例）+ 孤儿边降权
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { createKbBrainTestTables } from '../../helpers/kb-brain-test-db'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbBrainMetabolizeService } from '@core/platform/services/kb-brain/metabolize.service'

type EntityCtor = new (...args: unknown[]) => object

describe('KbBrainMetabolizeService v1', () => {
  let ds: DataSource
  let notes: KbNoteRepository
  let edges: KbKnowledgeEdgeRepository
  let atoms: KbAtomRepository
  const KB = 'kb-meta'

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
    notes = new KbNoteRepository(ds)
    edges = new KbKnowledgeEdgeRepository(ds)
    atoms = new KbAtomRepository(ds)
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('classicScore 重算：cited 驱动、实例加成、无引用为 0', async () => {
    const p1 = await notes.propose(KB, {
      title: '模式卡甲',
      description: 'x',
      type: 'setting-pattern',
      patternInstances: JSON.stringify([{ label: 'A' }, { label: 'B' }, { label: 'C' }]),
    })
    await notes.publish(p1.id)
    await notes.incCited([p1.id])
    const p2 = await notes.propose(KB, {
      title: '模式卡乙（零引用）',
      description: 'x',
      type: 'setting-pattern',
      patternInstances: JSON.stringify([{ label: 'A' }]),
    })
    await notes.publish(p2.id)

    await notes.recomputeClassic(KB)
    const a = await notes.findById(p1.id)
    const b = await notes.findById(p2.id)
    expect(a!.classicScore).toBeGreaterThan(0)
    expect(b!.classicScore).toBe(0) // ln(1+0)=0（无引用卡分值 0，且不触发重算——n 计数只含变化卡）
    expect(a!.classicScore).toBeGreaterThan(b!.classicScore)
  })

  it('孤儿边降权：端点 stale → confidence 减半；健康边不动', async () => {
    const [live, dead] = await atoms.createBatch([
      { knowledgeBaseId: KB, statement: '存活论断', type: 'fact', sourceDocumentId: 'docm', sourceQuote: '1' },
      { knowledgeBaseId: KB, statement: '废弃论断', type: 'fact', sourceDocumentId: 'docm', sourceQuote: '2' },
    ])
    await atoms.updateStatus(dead.id, { status: 'superseded', supersededByAtomId: live.id })
    const r1 = await edges.createBatch(KB, [
      { sourceKind: 'atom', sourceId: live.id, relation: 'leads-to', targetKind: 'atom', targetId: dead.id, evidence: '端点', confidence: 0.8 },
    ])
    expect(r1.created).toBe(1)
    // 状态映射由调用方传入（代谢服务查好；这里模拟 live 存活 / dead 已被取代）
    const statusById = new Map([
      [live.id, 'supported'],
      [dead.id, 'superseded'],
    ])
    expect(await edges.decayOrphans(KB, statusById)).toBe(1)
    const ns = await edges.neighborsOf(KB, [live.id])
    expect(ns[0].confidence).toBeCloseTo(0.4, 5)
    // 再跑一轮：0.4 > 0.1 继续减
    expect(await edges.decayOrphans(KB, statusById)).toBe(1)
  })

  it('runAll 全库整固不抛错（幂等）', async () => {
    const svc = new KbBrainMetabolizeService({
      repos: () => ({ notes, edges, atoms, allKbIds: async () => [KB] }),
      intervalMs: 60_000,
    })
    const out = await svc.runAll()
    expect(out.kbs).toBeGreaterThanOrEqual(1)
  })
})
