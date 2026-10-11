/**
 * 体系汇聚产线测试（v3 M2/M4）：盘点-结构化两步（四形态）、
 * 节点实体 attrs、sublevel-of 边（ladder）、structure-map 卡（人审）、
 * 材料不足跳过、幂等、解析强门槛（空壳元素剔除/relations 收编）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import {
  KbSystemAggregateService,
  parseSystemInventories,
} from '@core/platform/services/kb-brain/system-aggregate.service'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'
import { createKbBrainTestTables, insertTestKb } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

const INVENTORY_LLM: BrainLlmFn = async ({ user }) => {
  if (user.includes('体系论断 1')) {
    return JSON.stringify({
      systems: [
        {
          systemName: '修仙境界',
          kind: 'ladder',
          summary: '境界阶梯',
          confidence: 0.9,
          elements: [
            { name: '炼气期', order: 0, attrs: { 能力: '驭物飞行' }, evidenceQuote: '炼气期可驭物' },
            { name: '筑基期', order: 1, attrs: { 能力: '御剑' }, evidenceQuote: '筑基可御剑' },
            { name: '金丹期', order: 2, attrs: { 能力: '结丹' }, evidenceQuote: '金丹结成' },
          ],
        },
        {
          systemName: '门派势力',
          kind: 'catalog',
          summary: '正道门派清单',
          confidence: 0.8,
          elements: [
            { name: '掩月宗', order: 0, attrs: { 立场: '正道' }, evidenceQuote: '掩月宗为正道' },
            { name: '古剑门', order: 1, attrs: { 立场: '正道' }, evidenceQuote: '古剑门' },
          ],
        },
      ],
    })
  }
  return JSON.stringify({ systems: [] })
}

describe('体系汇聚（v3 M2/M4：盘点-结构化）', () => {
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

  it('全链：盘点 → ladder 元素实体+顺序边+结构卡 / catalog 成员实体', async () => {
    for (let i = 0; i < 12; i++) {
      await seedSettingAtom(`sa-${i}`, `体系论断 ${i}：境界与门派设定描述`, `引句 ${i}`)
    }
    const svc = new KbSystemAggregateService({
      llm: INVENTORY_LLM,
      repos: () => ({ atoms, entities: ents, edges, notes, passes }),
    })
    const out = await svc.run('kb-sa')
    expect(out.skipped).toBe(false)
    expect(out.systemsBuilt).toBe(2)

    // ladder：顺序 sublevel-of 边（炼气→筑基→金丹）
    expect(out.edgesCreated).toBeGreaterThanOrEqual(2)
    const node = await ents.upsertMention('kb-sa', { name: '金丹期', type: 'setting-system' })
    const nodeAttrs = JSON.parse(node.attrs ?? '{}') as Record<string, unknown>
    expect(nodeAttrs.system).toBe('修仙境界')
    expect(nodeAttrs.kind).toBe('ladder')
    expect(nodeAttrs.能力).toBe('结丹')

    // structure-map 卡（proposed 人审），标题带形态
    const card = (await notes.listByStatus('kb-sa', 'proposed', 1, 10)).rows.find(
      (r) => r.type === 'structure-map' && r.title.includes('修仙境界')
    )
    expect(card).toBeTruthy()
    expect(card!.body).toContain('顺序链')
    expect(card!.body).toContain('炼气期')

    // 幂等：同素材量重跑 → 跳过
    const again = await svc.run('kb-sa')
    expect(again.skipped).toBe(true)
    expect(again.reason).toBe('material-unchanged')
  }, 30000)

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

  it('parseSystemInventories：kind 校验、空壳元素剔除、relations 收编、单元素拒收', () => {
    const out = parseSystemInventories(
      JSON.stringify({
        systems: [
          {
            systemName: '势力网络',
            kind: 'network',
            relations: [{ from: '甲国', to: '乙国', type: '敌对', evidence: '边境摩擦' }],
            elements: [
              { name: '甲国', order: 0, attrs: { 立场: '强' }, evidenceQuote: '甲国强' },
              { name: '乙国', order: 1, attrs: { 立场: '弱' }, evidenceQuote: '乙国弱' },
              { name: '空壳国', order: 2 },
              'junk',
            ],
          },
          { systemName: '单元素', kind: 'catalog', elements: [{ name: '唯一', order: 0, attrs: { a: 'b' } }] },
          'junk',
        ],
      }),
    )
    expect(out.length).toBe(1)
    expect(out[0]!.kind).toBe('network')
    expect(out[0]!.elements.length).toBe(2)
    expect(out[0]!.relations.length).toBe(1)
  })
})
