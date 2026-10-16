/**
 * 品类归并与质量闭环测试（v2 P3/P4）：跨书实体归并（保守裁决/软合并/scope 标注）、
 * 设定变体矩阵、classicScore 跨书因子、质量门（低分→待审回接）、漂移监控、撤销。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import { KbAtomRepository, type KbAtomInput } from '@core/database/repositories/kb-atom.repository'
import { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import type { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { KbEventRepository, type KbEventInput } from '@core/database/repositories/kb-event.repository'
import { KbQaLogRepository } from '@core/database/repositories/kb-qa-log.repository'
import { KbAutomationLogRepository } from '@core/database/repositories/kb-automation-log.repository'
import { KbCorpusMergeService } from '@core/platform/services/kb-brain/corpus-merge.service'
import { KbCorpusPassesService } from '@core/platform/services/kb-brain/corpus-passes.service'
import { KbQaSamplerService } from '@core/platform/services/kb-brain/qa-sampler.service'
import { KbAutomationLogService } from '@core/platform/services/kb-brain/automation-log.service'
import { publishSmeltCard } from '@core/platform/services/kb-brain/smelt-common'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'
import { createKbBrainTestTables, insertTestKb, insertTestDoc } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

function atom(id: string, docId: string, kbId: string, subj: string): KbAtomInput {
  return {
    id,
    knowledgeBaseId: kbId,
    statement: `s-${id}`,
    type: 'fact',
    sourceDocumentId: docId,
    sourceChapterId: `${docId}-ch1`,
    sourceChapterHash: `h-${id}`,
    sourceQuote: 'q',
    subjectEntityId: subj,
    origin: 'ai',
  }
}

describe('跨书实体归并（v2 P3）', () => {
  let ds: DataSource
  let entRepo: KbEntityRepository
  let atomRepo: KbAtomRepository
  let edgeRepo: KbKnowledgeEdgeRepository
  let passRepo: KbDigestPassRepository

  const MERGE_LLM: BrainLlmFn = async ({ system }) => {
    if (system.includes('实体消歧员')) return JSON.stringify({ groups: [[0, 1]] })
    throw new Error(`未预期提示词: ${system.slice(0, 20)}`)
  }
  /** 金丹期/金丹境界 同向量；筑基期 异向量 */
  const embed = async (texts: string[]): Promise<number[][]> =>
    texts.map((t) => (t.includes('金丹') ? [1, 0] : [0, 1]))

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
    entRepo = new KbEntityRepository(ds)
    atomRepo = new KbAtomRepository(ds)
    edgeRepo = new KbKnowledgeEdgeRepository(ds)
    passRepo = new KbDigestPassRepository(ds)
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  async function seed(kbId: string, docA = 'doc-a', docB = 'doc-b'): Promise<{ primary: string; dup: string; solo: string }> {
    await insertTestKb(ds, { id: kbId })
    await insertTestDoc(ds, { id: docA, kbId })
    await insertTestDoc(ds, { id: docB, kbId })
    const primary = await entRepo.upsertMention(kbId, { name: '金丹期', type: 'setting-system' })
    const dup = await entRepo.upsertMention(kbId, { name: '金丹境界', type: 'setting-system' })
    const solo = await entRepo.upsertMention(kbId, { name: '筑基期', type: 'setting-system' })
    // 金丹期 挂 3 条（多者=规范）；金丹境界 挂 1 条；筑基期 仅 doc-a
    await atomRepo.createBatch([
      atom('a1', docA, kbId, primary.id),
      atom('a2', docB, kbId, primary.id),
      atom('a3', docA, kbId, primary.id),
      atom('a4', docA, kbId, dup.id),
      atom('a5', docA, kbId, solo.id),
    ])
    return { primary: primary.id, dup: dup.id, solo: solo.id }
  }

  it('归并全链：LLM 确认同概念 → 软合并 + 边/挂点改指 + 跨书实体标 corpus', async () => {
    const kbId = 'kb-c1'
    const { primary, dup, solo } = await seed(kbId, 'c1-a', 'c1-b')
    // 一条以 dup 为端点的边（验证 redirectNode）
    await edgeRepo.createBatch(kbId, [
      { sourceKind: 'entity', sourceId: dup, relation: 'depends-on', targetKind: 'entity', targetId: solo, evidence: 't' },
    ])
    const svc = new KbCorpusMergeService({
      llm: MERGE_LLM,
      embed,
      repos: () => ({ entities: entRepo, atoms: atomRepo, edges: edgeRepo, passes: passRepo }),
    })
    const out = await svc.run(kbId, null)
    expect(out.merged).toBe(1)
    expect(out.corpusMarked).toBeGreaterThanOrEqual(1) // 金丹期（≥2 书）

    const mergedDup = await entRepo.findById(dup)
    expect(mergedDup?.status).toBe('merged')
    expect(mergedDup?.targetEntityId).toBe(primary)
    // 挂点改指：a4 的 subject 现指向规范实体
    const a4 = await atomRepo.findById('a4')
    expect(a4?.subjectEntityId).toBe(primary)
    // 边改指
    const neighbors = await edgeRepo.neighborsOf(kbId, [primary])
    expect(neighbors.some((e) => e.relation === 'depends-on')).toBe(true)
    // scope：金丹期=corpus（2 书）；筑基期=book（单书）
    expect((await entRepo.findById(primary))?.scope).toBe('corpus')
    expect((await entRepo.findById(solo))?.scope).toBe('book')
    // 成本台账
    const rows = await passRepo.listByDocument(kbId)
    expect(rows.some((r) => r.passKey.startsWith('smelt:corpus-merge'))).toBe(true)
  })

  it('保守协议：LLM 判无可并 → 零合并；解析失败同样不并', async () => {
    const kbId = 'kb-c2'
    await seed(kbId, 'c2-a', 'c2-b')
    const svc = new KbCorpusMergeService({
      llm: async () => JSON.stringify({ groups: [] }),
      embed,
      repos: () => ({ entities: entRepo, atoms: atomRepo, edges: edgeRepo, passes: passRepo }),
    })
    const out = await svc.run(kbId, null)
    expect(out.merged).toBe(0)
    // 解析炸 → 两试后保守返回空组
    const bad = new KbCorpusMergeService({
      llm: async () => 'not-json',
      embed,
      repos: () => ({ entities: entRepo, atoms: atomRepo, edges: edgeRepo, passes: passRepo }),
    })
    expect((await bad.run(kbId, null)).merged).toBe(0)
  })
})

describe('品类矩阵与质量闭环（v2 P3/P4）', () => {
  let ds: DataSource
  let entRepo: KbEntityRepository
  let atomRepo: KbAtomRepository
  let notes: KbNoteRepository
  let passRepo: KbDigestPassRepository
  let events: KbEventRepository
  let qaLogs: KbQaLogRepository
  let autoLogs: KbAutomationLogRepository

  const MATRIX_LLM: BrainLlmFn = async ({ system }) => {
    if (system.includes('设定体系研究员')) {
      return JSON.stringify({
        title: '设定体系：金丹期—通用骨架与各书变体',
        skeleton: ['凝结金丹需三转淬炼', '金丹分品阶'],
        variants: [
          { doc: 'doc-a', variant: '九品金丹制' },
          { doc: 'doc-b', variant: '金丹分初中后期' },
        ],
        designHint: '自建体系至少保留代价约束',
        confidence: 0.8,
      })
    }
    if (system.includes('知识库质检员')) return JSON.stringify({ score: 0, reason: '空洞' })
    throw new Error(`未预期提示词: ${system.slice(0, 20)}`)
  }

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
    entRepo = new KbEntityRepository(ds)
    atomRepo = new KbAtomRepository(ds)
    notes = new KbNoteRepository(ds)
    passRepo = new KbDigestPassRepository(ds)
    events = new KbEventRepository(ds)
    qaLogs = new KbQaLogRepository(ds)
    autoLogs = new KbAutomationLogRepository(ds)
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('设定变体矩阵：corpus 概念跨书表述 → setting-pattern 卡（corpus-matrix 标签）+ 重跑演进', async () => {
    const kbId = 'kb-q1'
    await insertTestKb(ds, { id: kbId })
    await insertTestDoc(ds, { id: 'qa-a', kbId })
    await insertTestDoc(ds, { id: 'qa-b', kbId })
    const jin = await entRepo.upsertMention(kbId, { name: '金丹期', type: 'setting-system' })
    await entRepo.markScope([jin.id], 'corpus')
    await atomRepo.createBatch([
      atom('m1', 'qa-a', kbId, jin.id),
      atom('m2', 'qa-b', kbId, jin.id),
    ])
    const svc = new KbCorpusPassesService({
      llm: MATRIX_LLM,
      repos: () => ({ events, notes, passes: passRepo, docs: { findByKnowledgeBaseId: async () => [] } as never, entities: entRepo, atoms: atomRepo }),
    })
    const first = await svc.runSettingMatrix(kbId)
    expect(first.cards).toBe(1)
    const { rows } = await notes.listByStatus(kbId, 'published', 1, 10, 'setting-pattern')
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0]!.tags)).toContain('corpus-matrix')
    expect(rows[0]!.body).toContain('九品金丹制')
    const second = await svc.runSettingMatrix(kbId)
    expect(second.evolved).toBe(1)
    expect((await notes.findById(rows[0]!.id))!.version).toBe(2)
  })

  it('classicScore 跨书因子：跨 2 书实例的卡分高于同量单书卡', async () => {
    const kbId = 'kb-q2'
    await insertTestKb(ds, { id: kbId })
    const mk = async (title: string, docs: string[]) => {
      const n = await notes.propose(kbId, {
        title,
        description: 'd',
        type: 'plot-pattern',
        patternInstances: JSON.stringify(docs.map((d) => ({ documentId: d }))),
        tags: '["smelt"]',
      })
      await notes.incCited([n.id])
      return notes.publish(n.id)
    }
    await mk('单书高频', ['doc-a', 'doc-a', 'doc-a'])
    await mk('跨书共识', ['doc-a', 'doc-b', 'doc-c'])
    await notes.recomputeClassic(kbId)
    const { rows } = await notes.listByStatus(kbId, 'published', 1, 10, 'plot-pattern')
    const byTitle = new Map(rows.map((r) => [r.title, r.classicScore]))
    expect(byTitle.get('跨书共识')!).toBeGreaterThan(byTitle.get('单书高频')!)
  })

  it('质量门：抽检低分 → gate=review → publishSmeltCard 进待审；恢复后回直发', async () => {
    const kbId = 'kb-q3'
    await insertTestKb(ds, { id: kbId })
    // 预置 4 张已发布冶炼卡（抽检对象）
    for (let i = 0; i < 4; i++) {
      const n = await notes.propose(kbId, { title: `套路卡${i}`, description: 'd', body: 'b'.repeat(100), type: 'plot-pattern', tags: '["smelt"]' })
      await notes.publish(n.id)
    }
    const sampler = new KbQaSamplerService({
      llm: MATRIX_LLM, // 质检员恒 0 分
      repos: () => ({ notes, qaLogs, events, passes: passRepo }),
    })
    expect(await sampler.gateOf(kbId)).toBe('publish') // 无样本=直发（冷启动不误伤）
    const out = await sampler.sample(kbId)
    expect(out.sampled).toBe(4)
    expect(out.avg).toBe(0)
    expect(await sampler.gateOf(kbId)).toBe('review')
    // review 模式：publishSmeltCard 只 propose
    const card = await publishSmeltCard(notes, kbId, { title: '低分期新卡', description: 'd', type: 'plot-pattern' }, { review: true })
    expect(card.status).toBe('proposed')
    // 恢复：高分样本进入窗口 → 门回升
    await qaLogs.insertBatch([
      { kbId, noteId: 'n1', score: 2, reason: '' },
      { kbId, noteId: 'n2', score: 2, reason: '' },
      { kbId, noteId: 'n3', score: 2, reason: '' },
      { kbId, noteId: 'n4', score: 2, reason: '' },
      { kbId, noteId: 'n5', score: 2, reason: '' },
      { kbId, noteId: 'n6', score: 2, reason: '' },
      { kbId, noteId: 'n7', score: 2, reason: '' },
    ])
    expect(await sampler.gateOf(kbId)).toBe('publish')
  })

  it('漂移监控：单一场面类型 >80% 且总量 ≥50 → 告警', async () => {
    const kbId = 'kb-q4'
    await insertTestKb(ds, { id: kbId })
    const inputs: KbEventInput[] = []
    for (let i = 0; i < 55; i++) {
      inputs.push({
        knowledgeBaseId: kbId,
        sourceDocumentId: 'doc-a',
        sourceChapterId: 'ch',
        sourceChapterHash: null,
        sceneType: i < 50 ? 'probe' : 'battle',
        summary: `场面${i}`,
        participants: [],
        sourceQuote: 'q',
      })
    }
    await events.createBatch(inputs)
    const sampler = new KbQaSamplerService({
      llm: async () => JSON.stringify({ score: 2, reason: 'ok' }),
      repos: () => ({ notes, qaLogs, events, passes: passRepo }),
    })
    const out = await sampler.sample(kbId)
    expect(out.drift).toContain('probe')
  })

  it('合并实体后的 mention 解析：upsertMention 落到规范实体（不指向 dead 节点）', async () => {
    const kbId = 'kb-q6'
    await insertTestKb(ds, { id: kbId })
    const primary = await entRepo.upsertMention(kbId, { name: '金丹期', type: 'setting-system' })
    const dup = await entRepo.upsertMention(kbId, { name: '金丹境界', type: 'setting-system' })
    await entRepo.merge(dup.id, primary.id)
    // 消化链路再次遇到「金丹境界」这个 mention → 必须解析到规范实体
    const resolved = await entRepo.upsertMention(kbId, { name: '金丹境界', type: 'setting-system' })
    expect(resolved.id).toBe(primary.id)
    expect(resolved.status).toBe('active')
    // 别名吸收：规范实体记下了被并名
    expect(resolved.aliases).toContain('金丹境界')
  })

  it('质量门恢复路径：review 期新卡（proposed）也进抽样——高分待审卡把门拉回 publish', async () => {
    const kbId = 'kb-q7'
    await insertTestKb(ds, { id: kbId })
    // 先造 4 张高分已发布卡 + 拉低分（0 分样本×4 → 门降级）
    for (let i = 0; i < 4; i++) {
      const n = await notes.propose(kbId, { title: `高分卡${i}`, description: 'd', body: 'b'.repeat(80), type: 'plot-pattern', tags: '["smelt"]' })
      await notes.publish(n.id)
    }
    let gate: 'publish' | 'review' = 'publish'
    const mkSampler = (score: number) =>
      new KbQaSamplerService({
        llm: async () => JSON.stringify({ score, reason: '' }),
        repos: () => ({ notes, qaLogs, events, passes: passRepo }),
      })
    await mkSampler(0).sample(kbId) // 4 个 0 分
    gate = await mkSampler(2).gateOf(kbId)
    expect(gate).toBe('review')
    // review 期新卡（proposed）+ 高分 judge → 样本进窗 → 门恢复
    const pending = await notes.propose(kbId, { title: '待审期新卡', description: 'd', body: 'b'.repeat(80), type: 'plot-pattern', tags: '["smelt"]' })
    expect(pending.status).toBe('proposed')
    const out = await mkSampler(2).sample(kbId)
    expect(out.sampled).toBeGreaterThan(0)
    expect(await mkSampler(2).gateOf(kbId)).toBe('publish')
  })

  it('judge 每库模型与输出预算（M0-#5）：models.adjudicate 生效、maxTokens=2000', async () => {
    const kbId = 'kb-qjudge'
    await insertTestKb(ds, { id: kbId })
    await notes.propose(kbId, {
      title: '待检卡',
      description: 'd',
      body: 'b'.repeat(80),
      type: 'plot-pattern',
      tags: '["smelt"]',
    })
    const refs: Array<{ providerConfigId?: string; modelId?: string }> = []
    const budgets: number[] = []
    const sampler = new KbQaSamplerService({
      llmFactory: (ref) => async (req) => {
        refs.push(ref)
        budgets.push(req.maxTokens ?? 0)
        return JSON.stringify({ score: 2, reason: '' })
      },
      repos: () => ({
        notes,
        qaLogs,
        events,
        passes: passRepo,
        kbs: {
          findById: async (id: string) =>
            id === kbId
              ? ({ brainConfig: JSON.stringify({ enabled: true, models: { atomize: '', adjudicate: 'prov-x:model-y' } }) } as never)
              : null,
        } as unknown as Pick<KnowledgeBaseRepository, 'findById'>,
      }),
    })
    const out = await sampler.sample(kbId)
    expect(out.sampled).toBe(1)
    expect(out.gate).toBe('publish')
    expect(refs[0]).toEqual({ providerConfigId: 'prov-x', modelId: 'model-y' })
    expect(budgets).toEqual([2000])
  })

  it('撤销：动作日志 → undo 归档产物卡 → 重复撤销被拒', async () => {
    const kbId = 'kb-q5'
    await insertTestKb(ds, { id: kbId })
    const c1 = await publishSmeltCard(notes, kbId, { title: '撤销对象一', description: 'd', type: 'plot-pattern' })
    const c2 = await publishSmeltCard(notes, kbId, { title: '撤销对象二', description: 'd', type: 'plot-pattern' })
    const logSvc = new KbAutomationLogService({ repos: () => ({ logs: autoLogs, notes }) })
    const log = await autoLogs.record(kbId, 'smelt', { noteIds: [c1.id, c2.id] })
    const list = await logSvc.listRecent(kbId, 5)
    expect(list[0]!.undoable).toBe(true)
    expect(list[0]!.noteCount).toBe(2)
    const undone = await logSvc.undo(log.id)
    expect(undone.ok).toBe(true)
    expect(undone.archived).toBe(2)
    expect((await notes.findById(c1.id))!.status).toBe('archived')
    const again = await logSvc.undo(log.id)
    expect(again.ok).toBe(false)
  })
})
