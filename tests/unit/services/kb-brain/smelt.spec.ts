/**
 * 冶炼层测试（v2 P1）：套路归纳全链（聚类/门槛/分布门/published 直发/实例演进/
 * smelt 成本台账）、案例拆解、原理归纳（链回套路）、品类认知（演进刷新）、
 * 管线编排 fail-soft。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbEventRepository, type KbEventInput } from '@core/database/repositories/kb-event.repository'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { KbPatternInductService } from '@core/platform/services/kb-brain/pattern-induct.service'
import { KbCaseStudyService } from '@core/platform/services/kb-brain/case-study.service'
import { KbPrincipleDistillService } from '@core/platform/services/kb-brain/principle-distill.service'
import { KbCorpusPassesService } from '@core/platform/services/kb-brain/corpus-passes.service'
import { KbSmeltPipelineService } from '@core/platform/services/kb-brain/smelt-pipeline.service'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'
import { createKbBrainTestTables, insertTestKb, insertTestDoc } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

let caseCounter = 0

/** 按系统提示词分流的假 LLM：套路研究员/写作教练/叙事理论研究员/品类研究者 */
const fakeLlm: BrainLlmFn = async ({ system, user }) => {
  if (system.includes('套路研究员')) {
    expect(user).toContain('场面类型：probe')
    return JSON.stringify({
      title: '「师长核查弟子隐瞒」场面套路',
      whenToUse: '写师徒线冲突/信任危机场面时取用',
      steps: ['埋反常细节', '设局试探', '揭穿或化解', '裂痕成为支点'],
      variants: ['温情版', '权谋版'],
      why: '制度性猜疑替代脸谱化冲突，张力来自关系',
      boundary: '师徒关系刚建立时别用',
      confidence: 0.9,
    })
  }
  if (system.includes('写作教练')) {
    caseCounter += 1
    return JSON.stringify({
      title: `案例：试探场面的信息差控制——把脉核查 ${caseCounter}`,
      whatWorks: '信息差管理：读者知道弟子隐瞒、师长不知道，核查过程释放张力',
      learn: '把冲突写成一个逐步收窄的信息差过程',
      quoteFocus: '李长老扣住他的手腕',
      quality: 0.8,
    })
  }
  if (system.includes('叙事理论研究员')) {
    return JSON.stringify({
      title: '期待感=间隔×代价',
      principle: '期待感与两次兑现的间隔和每次兑现的代价成正比',
      mechanism: '间隔积累势能，代价赋予兑现以重量',
      whenFails: '代价缺席时兑现会透支下一次期待',
      evidenceIdx: [0, 2],
      confidence: 0.8,
    })
  }
  if (system.includes('品类研究者')) {
    return JSON.stringify({
      title: '品类认知：修真师徒叙事',
      expectations: ['境界体系清晰可循', '师徒关系有张力'],
      payoffs: ['突破兑现积攒的期待', '以下克上反转地位差'],
      pitfalls: ['无代价连续突破', '反派脸谱化'],
      confidence: 0.7,
    })
  }
  throw new Error(`未预期的提示词: ${system.slice(0, 30)}`)
}

/** 假嵌入：probe→[1,0]，其余→[0,1]（保证桶内聚成同簇） */
const fakeEmbed = async (texts: string[]): Promise<number[][]> =>
  texts.map((t) => (t.includes('probe') ? [1, 0] : [0, 1]))

function makeEventInput(i: number, docId: string, kbId: string, sceneType = 'probe'): KbEventInput {
  return {
    knowledgeBaseId: kbId,
    sourceDocumentId: docId,
    sourceChapterId: `${docId}-ch${Math.floor(i / 2)}`,
    sourceChapterHash: `hash-${docId}-${i}`,
    sceneType,
    summary: `李长老借把脉核查弟子隐瞒的修为（第${i}次同型场面）`,
    participants: [{ name: '李长老' }, { name: '韩某' }],
    cause: '韩某谎报修炼进度',
    outcome: '真实进度暴露',
    sourceQuote: '李长老扣住他的手腕，眉头渐渐锁紧',
  }
}

describe('冶炼层（v2 P1）', () => {
  let ds: DataSource
  let events: KbEventRepository
  let notes: KbNoteRepository
  let passes: KbDigestPassRepository

  const mkPatternInduct = () =>
    new KbPatternInductService({
      llm: fakeLlm,
      embed: fakeEmbed,
      repos: () => ({ events, notes, passes }),
    })

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
    events = new KbEventRepository(ds)
    notes = new KbNoteRepository(ds)
    passes = new KbDigestPassRepository(ds)
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('套路归纳全链：聚类过门 → plot-pattern 卡 published 直发 + 实例登记 + smelt 成本台账', async () => {
    const kbId = 'kb-m1'
    await insertTestKb(ds, { id: kbId })
    await insertTestDoc(ds, { id: 'doc-a', kbId })
    await insertTestDoc(ds, { id: 'doc-b', kbId })
    await events.createBatch([
      ...Array.from({ length: 8 }, (_, i) => makeEventInput(i, 'doc-a', kbId)),
      ...Array.from({ length: 8 }, (_, i) => makeEventInput(i + 100, 'doc-b', kbId)),
    ])

    const out = await mkPatternInduct().run(kbId, null)
    expect(out.skipped).toBe(false)
    expect(out.clustersExamined).toBe(1)
    expect(out.cardsCreated).toBe(1)
    expect(out.llmCalls).toBe(1)

    const { rows } = await notes.listByStatus(kbId, 'published', 1, 20, 'plot-pattern')
    expect(rows).toHaveLength(1)
    const card = rows[0]!
    expect(card.title).toBe('「师长核查弟子隐瞒」场面套路')
    expect(JSON.parse(card.tags)).toEqual(['smelt', 'scene:probe'])
    expect(card.body).toContain('出现 16 次（覆盖 8 章 / 2 本书）')
    const instances = JSON.parse(card.patternInstances!) as Array<{ eventId: string }>
    expect(instances).toHaveLength(16)
    expect((JSON.parse(card.evidence) as unknown[]).length).toBeGreaterThan(0)

    // 成本入台账（passType smelt，熔断可见）
    const smeltRows = await passes.listByDocument(kbId)
    const smelt = smeltRows.filter((r) => r.passType === 'smelt')
    expect(smelt).toHaveLength(1)
    expect((JSON.parse(smelt[0]!.costJson ?? '{}') as { calls: number }).calls).toBe(1)
  })

  it('套路卡演进：原料增长后重跑 → 同题卡吸收新实例 + version+1，不重建', async () => {
    const kbId = 'kb-m1'
    await events.createBatch(Array.from({ length: 4 }, (_, i) => makeEventInput(i + 200, 'doc-a', kbId, 'probe')))
    const out = await mkPatternInduct().run(kbId, null)
    expect(out.cardsCreated).toBe(0)
    expect(out.cardsEvolved).toBe(1)

    const { rows } = await notes.listByStatus(kbId, 'published', 1, 20, 'plot-pattern')
    expect(rows).toHaveLength(1) // 没有第二张卡
    const card = rows[0]!
    expect(card.version).toBe(2)
    expect(JSON.parse(card.patternInstances!) as unknown[]).toHaveLength(20) // 16 旧 + 4 新
  })

  it('原料不足门：8 个事件 → 跳过且零 LLM 调用', async () => {
    const kbId = 'kb-m2'
    await insertTestKb(ds, { id: kbId })
    await insertTestDoc(ds, { id: 'doc-c', kbId })
    await events.createBatch(Array.from({ length: 8 }, (_, i) => makeEventInput(i, 'doc-c', kbId)))
    const out = await mkPatternInduct().run(kbId, null)
    expect(out.skipped).toBe(true)
    expect(out.llmCalls).toBe(0)
  })

  it('单书簇门禁：多书库中仅单书覆盖的簇不成卡（单书簇是情节记录不是品类套路）', async () => {
    const kbId = 'kb-m3'
    await insertTestKb(ds, { id: kbId })
    await insertTestDoc(ds, { id: 'doc-d', kbId })
    await insertTestDoc(ds, { id: 'doc-e', kbId })
    await events.createBatch([
      ...Array.from({ length: 8 }, (_, i) => makeEventInput(i, 'doc-d', kbId, 'probe')),
      ...Array.from({ length: 8 }, (_, i) => makeEventInput(i + 100, 'doc-e', kbId, 'conflict')),
    ])
    const out = await mkPatternInduct().run(kbId, null)
    expect(out.clustersExamined).toBe(0) // probe 簇 8 个事件够门槛但只覆盖 1 本书 → 拦下
    expect(out.llmCalls).toBe(0)
    const { rows } = await notes.listByStatus(kbId, 'published', 1, 20, 'plot-pattern')
    expect(rows).toHaveLength(0)
  })

  it('案例拆解：每类选跨书样本 → craft-case 卡 published，evidence 锚到事件', async () => {
    const kbId = 'kb-m4'
    await insertTestKb(ds, { id: kbId })
    await insertTestDoc(ds, { id: 'doc-f', kbId })
    await insertTestDoc(ds, { id: 'doc-g', kbId })
    await events.createBatch([
      ...Array.from({ length: 6 }, (_, i) => makeEventInput(i, 'doc-f', kbId)),
      ...Array.from({ length: 6 }, (_, i) => makeEventInput(i + 100, 'doc-g', kbId)),
    ])
    const svc = new KbCaseStudyService({ llm: fakeLlm, embed: fakeEmbed, repos: () => ({ events, notes, passes }) })
    const out = await svc.run(kbId, null)
    expect(out.cards).toBe(2) // 每书一个样本
    const { rows } = await notes.listByStatus(kbId, 'published', 1, 20, 'craft-case')
    expect(rows).toHaveLength(2)
    const docsCovered = new Set(
      rows.flatMap((r) => (JSON.parse(r.evidence) as Array<{ documentId: string }>).map((e) => e.documentId)),
    )
    expect(docsCovered.size).toBe(2)
  })

  it('原理归纳：≥4 张冶炼套路卡 → principle 卡链回 ≥2 套路；不足 4 张零调用', async () => {
    const kbId = 'kb-m5'
    await insertTestKb(ds, { id: kbId })
    const svc = new KbPrincipleDistillService({ llm: fakeLlm, embed: fakeEmbed, repos: () => ({ notes, passes }) })
    // 3 张 → 不足门槛
    for (let i = 0; i < 3; i++) {
      await notes.propose(kbId, {
        title: `套路${i}`,
        description: `d${i}`,
        type: 'plot-pattern',
        tags: '["smelt","scene:probe"]',
      }).then((n) => notes.publish(n.id))
    }
    expect((await svc.run(kbId, null)).llmCalls).toBe(0)
    // 第 4 张 → 归纳
    const n4 = await notes.propose(kbId, { title: '套路3', description: 'd3', type: 'plot-pattern', tags: '["smelt","scene:probe"]' })
    await notes.publish(n4.id)
    const out = await svc.run(kbId, null)
    expect(out.cards).toBe(1)
    const { rows } = await notes.listByStatus(kbId, 'published', 1, 20, 'principle')
    expect(rows).toHaveLength(1)
    const anchors = JSON.parse(rows[0]!.evidence) as Array<{ noteId: string }>
    expect(anchors.length).toBeGreaterThanOrEqual(2)
    // 非 smelt 标签的 plot-pattern 不参与（distill 设定轨自己的体系）
  })

  it('品类认知：分布+套路清单 → genre-insight 卡；重跑演进 version+1', async () => {
    const kbId = 'kb-m6'
    await insertTestKb(ds, { id: kbId })
    await insertTestDoc(ds, { id: 'doc-h', kbId })
    await events.createBatch(Array.from({ length: 10 }, (_, i) => makeEventInput(i, 'doc-h', kbId)))
    const p = await notes.propose(kbId, {
      title: '「师长核查弟子隐瞒」场面套路',
      description: 'd',
      type: 'plot-pattern',
      patternInstances: JSON.stringify([{ documentId: 'doc-h' }, { documentId: 'doc-h' }]),
      tags: '["smelt","scene:probe"]',
    })
    await notes.publish(p.id)

    const svc = new KbCorpusPassesService({ llm: fakeLlm, repos: () => ({ events, notes, passes, docs: { findByKnowledgeBaseId: async () => [{ id: 'doc-h' }] } as never }) })
    const first = await svc.runGenreInsight(kbId)
    expect(first.card).toBe(true)
    const { rows } = await notes.listByStatus(kbId, 'published', 1, 20, 'genre-insight')
    expect(rows).toHaveLength(1)
    const second = await svc.runGenreInsight(kbId)
    expect(second.evolved).toBe(true)
    const after = await notes.findById(rows[0]!.id)
    expect(after!.version).toBe(2)
  })

  it('管线编排：四阶段顺序执行 + 单阶段 fail-soft', async () => {
    const order: string[] = []
    const mk = (name: string, fail = false) =>
      ({
        isRunning: () => false,
        run: async () => {
          order.push(name)
          if (fail) throw new Error('boom')
          return name === 'caseStudy' ? { cards: 1, llmCalls: 1, createdNoteIds: ['x1'] } : { llmCalls: 0, createdNoteIds: [] }
        },
        runGenreInsight: async () => {
          order.push(name)
          return { card: true, evolved: false, createdNoteIds: ['x2'] }
        },
      }) as never
    const pipeline = new KbSmeltPipelineService({
      kbLookup: async () => ({ embeddingConfig: null, modelRef: 'prov:m' }),
      patternInduct: mk('patternInduct', true) as never,
      caseStudy: mk('caseStudy') as never,
      principle: mk('principle') as never,
      corpus: mk('corpus') as never,
      qa: {
        gateOf: async () => 'review',
        sample: async () => {
          order.push('qa')
          return { sampled: 0, avg: null, gate: 'review' }
        },
      },
    })
    const out = await pipeline.runAll('kb-x')
    expect(order).toEqual(['patternInduct', 'caseStudy', 'principle', 'corpus', 'qa']) // 失败不阻断
    expect(out.stages[0]!.ran).toBe(false)
    expect(out.stages[0]!.error).toContain('boom')
    expect(out.gate).toBe('review') // 质量门贯穿（review 模式传给各产线）
    expect(out.stages.filter((s) => s.ran)).toHaveLength(4)
  })
})
