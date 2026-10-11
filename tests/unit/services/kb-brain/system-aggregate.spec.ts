/**
 * 体系汇聚产线测试（v3 M2）：体系树解析收编、节点实体 attrs、sublevel-of 边、
 * structure-map 卡（人审）、材料不足跳过、幂等。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { KbSystemAggregateService, parseSystemTrees } from '@core/platform/services/kb-brain/system-aggregate.service'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'
import { createKbBrainTestTables, insertTestKb } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

const TREE_LLM: BrainLlmFn = async () =>
  JSON.stringify({
    systems: [
      {
        systemName: '青云门修真道法',
        confidence: 0.85,
        nodes: [
          { name: '玉清境', order: 0, attrs: { 能力: '驭物飞行', 突破条件: '太极玄清道第三层' }, evidenceQuote: '玉清境可驭物飞行' },
          { name: '上清境', order: 1, attrs: { 能力: '神剑御雷' }, evidenceQuote: '上清境界方能施展神剑御雷真诀' },
          { name: '太清境', order: 2, attrs: { 能力: '驾驭诛仙剑阵' }, evidenceQuote: '催持诛仙剑阵需修至太清' },
        ],
      },
    ],
  })

describe('体系汇聚（v3 M2）', () => {
  let ds: DataSource
  let atoms: KbAtomRepository
  let ents: KbEntityRepository
  let edges: KbKnowledgeEdgeRepository
  let notes: KbNoteRepository
  let passes: KbDigestPassRepository

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
    await insertTestKb(ds, { id: 'kb-sa' })
    atoms = new KbAtomRepository(ds)
    ents = new KbEntityRepository(ds)
    edges = new KbKnowledgeEdgeRepository(ds)
    notes = new KbNoteRepository(ds)
    passes = new KbDigestPassRepository(ds)
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  async function seedSettingAtom(id: string, statement: string, quote: string): Promise<void> {
    await atoms.createBatch([{
      id,
      knowledgeBaseId: 'kb-sa',
      statement,
      type: 'fact',
      layer: 'setting',
      sourceDocumentId: 'doc-sa',
      sourceQuote: quote,
    }])
  }

  it('全链：setting 论断 → 体系树（节点 attrs / sublevel-of 边 / structure-map 卡）', async () => {
    for (let i = 0; i < 12; i++) {
      await seedSettingAtom(`sa-${i}`, `体系论断 ${i}：境界规则描述`, `引句 ${i}`)
    }
    const svc = new KbSystemAggregateService({
      llm: TREE_LLM,
      repos: () => ({ atoms, entities: ents, edges, notes, passes }),
    })
    const out = await svc.run('kb-sa')
    expect(out.skipped).toBe(false)
    expect(out.systemsBuilt).toBe(1)
    expect(out.nodesReused).toBe(3)
    expect(out.edgesCreated).toBe(2)

    // 节点实体：attrs 落库
    const node = await ents.upsertMention('kb-sa', { name: '太清境', type: 'setting-system' })
    expect(JSON.parse(node.attrs ?? '{}')).toMatchObject({ order: 2, system: '青云门修真道法', 能力: '驾驭诛仙剑阵' })
    // structure-map 卡（proposed 人审）
    const card = (await notes.listByStatus('kb-sa', 'proposed', 1, 10)).rows.find((r) => r.type === 'structure-map')
    expect(card).toBeTruthy()
    expect(card!.body).toContain('太清境')
    expect(card!.body).toContain('证据')

    // 幂等：同素材量重跑 → material-unchanged 跳过
    const again = await svc.run('kb-sa')
    expect(again.skipped).toBe(true)
    expect(again.reason).toBe('material-unchanged')
  })

  it('材料不足（setting 层 <12）跳过不烧调用', async () => {
    await insertTestKb(ds, { id: 'kb-sa2' })
    for (let i = 0; i < 5; i++) {
      await atoms.createBatch([{
        id: `sb-${i}`,
        knowledgeBaseId: 'kb-sa2',
        statement: `设定 ${i}`,
        type: 'fact',
        layer: 'setting',
        sourceDocumentId: 'doc-sa2',
        sourceQuote: 'q',
      }])
    }
    const svc = new KbSystemAggregateService({
      llm: async () => {
        throw new Error('不应调用')
      },
      repos: () => ({ atoms, entities: ents, edges, notes, passes }),
    })
    const out = await svc.run('kb-sa2')
    expect(out.skipped).toBe(true)
    expect(out.reason).toContain('材料不足')
  })

  it('parseSystemTrees：空壳节点剔除（v3 质量门槛）、缺体系名跳过、order 缺省补序', () => {
    const out = parseSystemTrees(
      JSON.stringify({
        systems: [
          {
            systemName: '体系A',
            nodes: [
              { name: '下位', order: 0, attrs: { 能力: 'x' } },
              { name: '中位', order: 1, attrs: {}, evidenceQuote: '中位有证据' },
              { name: '空壳', order: 2 },
              { name: '', order: 3 },
              'junk',
              { name: '上位', order: 2, attrs: { 能力: 'y' } },
            ],
            confidence: 0.7,
          },
          { nodes: [{ name: '无名单节点', attrs: { a: 'b' } }] },
          'junk',
        ],
      }),
    )
    expect(out.length).toBe(1)
    expect(out[0]!.nodes.length).toBe(3)
    expect(out[0]!.nodes.map((n) => n.name)).toEqual(['下位', '中位', '上位'])
    expect(out[0]!.nodes[1]!.order).toBe(1)
  })
})
