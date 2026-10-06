/**
 * 场面事件轨测试（v2 P0 原料层）
 *
 * 覆盖：scenes 输出契约与归一（非法类型归 other/坏条目剔除/去重上限）、
 * 双轨落库（kb_events 行 + offsets 定位 + participants 实体解析 + event: 向量 +
 * 台账两行记账且成本只记 base）、幂等重跑、存量回填（events-only prompt/幂等/
 * 空章零产出 done）、非小说门禁、删文档级联清理。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { KbEventRepository } from '@core/database/repositories/kb-event.repository'
import { KbInvertedIndexRepository } from '@core/database/repositories/kb-inverted-index.repository'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { KbBrainDigestService, type KbBrainDigestDeps } from '@core/platform/services/kb-brain/digest-orchestrator.service'
import { AtomizeService, dedupeScenes, type LocatedScene } from '@core/platform/services/kb-brain/atomize.service'
import { validateAtomizeOutput, validateSceneBackfillOutput } from '@core/platform/services/kb-brain/schemas'
import { cleanupBrainArtifactsForDocument } from '@core/platform/services/kb-brain/artifact-cleanup'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'
import { createKbBrainTestTables, insertTestKb, insertTestDoc } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

const SCENE_QUOTE = '李长老扣住他的手腕，眉头渐渐锁紧'
const CH1_CONTENT = `韩某低着头。${SCENE_QUOTE}。殿内无人敢言。`

const ATOMIZE_WITH_SCENES = JSON.stringify({
  atoms: [
    { statement: '以把脉核查弟子修为是宗门师长常用手段', type: 'fact', layer: 'setting', certainty: 0.9, quote: SCENE_QUOTE, subject: '李长老' },
  ],
  events: [],
  scenes: [
    {
      summary: '李长老借把脉当众核查韩某隐瞒的修为',
      sceneType: 'probe',
      participants: ['李长老', '韩某'],
      cause: '韩某谎报修炼进度',
      outcome: '真实进度暴露，师徒生隙',
      quote: SCENE_QUOTE,
    },
  ],
  mentions: [
    { name: '李长老', type: 'character' },
    { name: '韩某', type: 'character' },
  ],
})

const SCENE_BACKFILL_RESP = JSON.stringify({
  scenes: [
    {
      summary: '李长老借把脉当众核查韩某隐瞒的修为',
      sceneType: 'probe',
      participants: ['李长老', '韩某'],
      quote: SCENE_QUOTE,
    },
  ],
  mentions: [
    { name: '李长老', type: 'character' },
    { name: '韩某', type: 'character' },
  ],
})

describe('scenes 输出契约（schemas）', () => {
  it('合法输出通过；非法 sceneType 归 other、坏条目剔除、participants 清洗', () => {
    const out = validateAtomizeOutput({
      atoms: [],
      scenes: [
        { summary: '场面一', sceneType: 'probe', participants: ['张三', '李四'], quote: 'q1' },
        { summary: '场面二', sceneType: '不对的枚举', participants: ['王五', 'x', 42], quote: 'q2' },
        { summary: '', sceneType: 'battle', quote: 'q3' }, // 缺 summary → 剔除
        '裸字符串', // 坏条目 → 剔除
      ],
    })
    expect(out.scenes).toHaveLength(2)
    expect(out.scenes![0]!.sceneType).toBe('probe')
    expect(out.scenes![1]!.sceneType).toBe('other') // 非法枚举归 other 不毁条目
    expect(out.scenes![1]!.participants).toEqual(['王五']) // 单字/非字符串剔除
  })

  it('补采输出：缺 scenes 键补空（纯过场章合法）；mentions 字符串数组收编', () => {
    const out = validateSceneBackfillOutput({ mentions: ['李长老'] })
    expect(out.scenes).toEqual([])
    expect(out.mentions).toEqual([{ name: '李长老', type: 'concept' }])
  })

  it('dedupeScenes：summary 去重 + 章级上限', () => {
    const mk = (i: number): LocatedScene => ({
      summary: `场面${i % 5}`, sceneType: 'other', participants: [], quote: 'q',
      startOffset: null, endOffset: null, windowIndex: 0,
    })
    const out = dedupeScenes(Array.from({ length: 40 }, (_, i) => mk(i)))
    expect(out).toHaveLength(5) // 5 个不同 summary
    const capped = dedupeScenes(Array.from({ length: 30 }, (_, i) => mk(i + 100)))
    expect(capped.length).toBeLessThanOrEqual(24)
  })
})

describe('场面轨全链（双轨落库 + 回填 + 级联）', () => {
  let ds: DataSource
  let eventRepo: KbEventRepository
  let passRepo: KbDigestPassRepository
  let llmCalls: Array<{ system: string; user: string }>
  let vectorRows: Array<{ chunkId: string; knowledgeBaseId: string }>
  let svc: KbBrainDigestService

  const makeRepos = () => ({
    atoms: new KbAtomRepository(ds),
    entities: new KbEntityRepository(ds),
    notes: new KbNoteRepository(ds),
    edges: new KbKnowledgeEdgeRepository(ds),
    passes: passRepo,
    docs: new KbDocumentRepository(ds),
    chapters: new KbChapterRepository(ds),
    kbs: new KnowledgeBaseRepository(ds),
    chunks: null,
    vectors: {
      createBatch: async (rows: Array<{ chunkId: string; knowledgeBaseId: string }>) => {
        vectorRows.push(...rows)
      },
    },
    inverted: new KbInvertedIndexRepository(ds),
    events: eventRepo,
  })

  const makeDeps = (): KbBrainDigestDeps => ({
    llm: (async (req) => {
      llmCalls.push({ system: req.system, user: req.user })
      if (req.system.includes('裁决员')) {
        return JSON.stringify({ duplicates: [], contradictions: [], novel: [] })
      }
      if (req.system.includes('场面记录员')) return SCENE_BACKFILL_RESP
      return ATOMIZE_WITH_SCENES
    }) as BrainLlmFn,
    embed: async (texts) => texts.map((_, i) => [i, 0.1, 0.2, 0.3]),
    repos: makeRepos,
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
    eventRepo = new KbEventRepository(ds)
    passRepo = new KbDigestPassRepository(ds)

    await insertTestKb(ds, { id: 'kb-s', brainConfig: '{"enabled":true,"digestion":{"enabled":true}}' })
    await insertTestDoc(ds, { id: 'doc-s', kbId: 'kb-s' })
    await insertTestKb(ds, {
      id: 'kb-k',
      brainConfig: '{"enabled":true,"digestion":{"enabled":true},"profile":{"contentType":"knowledge","genre":""}}',
    })
    await insertTestDoc(ds, { id: 'doc-k', kbId: 'kb-k' })

    llmCalls = []
    vectorRows = []
    const chapters = new KbChapterRepository(ds)
    for (const [docId, chId] of [
      ['doc-s', 'sch-1'],
      ['doc-k', 'kch-1'],
    ] as const) {
      await chapters.replaceByDocument(docId, [
        {
          id: chId,
          documentId: docId,
          knowledgeBaseId: docId === 'doc-s' ? 'kb-s' : 'kb-k',
          title: '第1章',
          level: 1,
          ordering: 0,
          content: CH1_CONTENT,
          contentHash: `hash-${chId}`,
        },
      ])
    }
    svc = new KbBrainDigestService(makeDeps())
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('双轨落库：kb_events 行 + 定位/参与者实体/向量 + 台账两行（成本只记 base）', async () => {
    await svc.enqueueDocument('doc-s', null)

    const rows = await eventRepo.findByKb('kb-s')
    expect(rows).toHaveLength(1)
    const ev = rows[0]!
    expect(ev.sceneType).toBe('probe')
    expect(ev.sourceChapterId).toBe('sch-1')
    expect(ev.startOffset).toBe(CH1_CONTENT.indexOf(SCENE_QUOTE))
    // 参与者实体解析回填（李长老/韩某 upsert 后挂 id）
    const participants = JSON.parse(ev.participants) as Array<{ name: string; entityId?: string }>
    expect(participants.map((p) => p.name).sort()).toEqual(['李长老', '韩某'])
    for (const p of participants) expect(p.entityId).toBeTruthy()

    // event: 命名空间向量入池
    expect(vectorRows.some((r) => r.chunkId === `event:${ev.id}` && r.knowledgeBaseId === 'kb-s')).toBe(true)

    // 台账：base 与 events 各一行 done；成本记 base（events 行 calls=0——同一次调用不双计）
    const passes = await passRepo.listByDocument('doc-s')
    const base = passes.find((p) => p.passType === 'base')!
    const scene = passes.find((p) => p.passType === 'events')!
    expect(base.status).toBe('done')
    expect(scene.status).toBe('done')
    expect(scene.passKey).toBe('events#1')
    expect((JSON.parse(base.costJson ?? '{}') as { calls: number }).calls).toBeGreaterThan(0)
    expect((JSON.parse(scene.costJson ?? '{}') as { calls: number }).calls).toBe(0)
    expect((JSON.parse(scene.statsJson ?? '{}') as { scenes: number }).scenes).toBe(1)
  }, 30000)

  it('幂等重跑：同 hash 再消化不新增场面、不调 LLM', async () => {
    const before = (await eventRepo.findByKb('kb-s')).length
    const llmBefore = llmCalls.length
    await svc.enqueueDocument('doc-s', null)
    expect((await eventRepo.findByKb('kb-s')).length).toBe(before)
    expect(llmCalls.length).toBe(llmBefore)
  })

  it('非小说门禁：knowledge 库不建场面轨台账、不落场面', async () => {
    await svc.enqueueDocument('doc-k', null)
    const passes = await passRepo.listByDocument('doc-k')
    expect(passes.some((p) => p.passType === 'events')).toBe(false)
    expect(await eventRepo.findByKb('kb-k')).toHaveLength(0)
    // 回填也被门禁挡住
    const out = await svc.backfillScenes('kb-k')
    expect(out).toEqual({ processed: 0, scenes: 0 })
  }, 30000)

  it('存量回填：events-only prompt、台账幂等、空章零产出 done 不烧调用', async () => {
    // 造一个"老库章"：base 已 done（手动落台账），无 events 行
    await passRepo.ensurePass({
      knowledgeBaseId: 'kb-s',
      documentId: 'doc-s',
      chapterId: 'sch-1',
      passType: 'base',
      passKey: 'base',
      chapterHash: 'hash-sch-1',
    })
    const baseRow = (await passRepo.listByDocument('doc-s')).find((p) => p.passType === 'base')!
    await passRepo.setRunning(baseRow.id)
    await passRepo.setDone(baseRow.id, { atoms: 1 }, { calls: 1, tokensIn: 0, tokensOut: 0 })
    // 删掉双轨测试建立的 events 台账行，模拟 P0 之前的存量状态（场面行也一并清）
    await ds.query(`DELETE FROM kb_digest_passes WHERE pass_type='events' AND document_id='doc-s'`)
    await eventRepo.deleteByChapter('sch-1')
    await ds.query(`UPDATE kb_documents SET brain_status='digested' WHERE id='doc-s'`)

    const llmBefore = llmCalls.length
    const out = await svc.backfillScenes('kb-s')
    expect(out.processed).toBe(1)
    expect(out.scenes).toBe(1)
    // 补采走独立 prompt（场面记录员，不带 atoms 指令）
    const backfillCall = llmCalls[llmBefore]!
    expect(backfillCall.system).toContain('场面记录员')
    expect(backfillCall.system).not.toContain('原子论断')
    // 成本记 events 台账（补采是真实调用，calls=窗口数）
    const scene = (await passRepo.listByDocument('doc-s')).find((p) => p.passType === 'events')!
    expect((JSON.parse(scene.costJson ?? '{}') as { calls: number }).calls).toBe(1)

    // 幂等：再跑一轮全部跳过（processed=0，无新 LLM 调用）
    const again = await svc.backfillScenes('kb-s')
    expect(again.processed).toBe(0)
    expect(llmCalls.length).toBe(llmBefore + 1)
  }, 30000)

  it('删文档级联：atoms/events/passes 清理 + 边按端点删除 + 卡片剔引用 + 命名空间向量', async () => {
    // 造卡片引用（evidence + pattern_instances 指向 doc-s 与另一个文档）
    const notes = new KbNoteRepository(ds)
    const note = await notes.propose('kb-s', {
      title: '师长核查套路',
      description: '师徒线冲突引擎',
      type: 'plot-pattern',
      evidence: JSON.stringify([
        { documentId: 'doc-s', quote: '把脉' },
        { documentId: 'doc-other', quote: 'other' },
      ]),
      patternInstances: JSON.stringify([
        { documentId: 'doc-s', 参数: '温情版' },
        { documentId: 'doc-other', 参数: '权谋版' },
      ]),
    })
    // 造边：atom→atom（两端都在 doc-s）
    const atomRepo = new KbAtomRepository(ds)
    const atoms = await atomRepo.findByDocument('doc-s', { lensNoteId: null })
    expect(atoms.length).toBeGreaterThan(0)
    if (atoms.length >= 2) {
      await new KbKnowledgeEdgeRepository(ds).createBatch('kb-s', [
        { sourceKind: 'atom', sourceId: atoms[0]!.id, relation: 'leads-to', targetKind: 'atom', targetId: atoms[1]!.id, evidence: 'test' },
      ])
    }
    vectorRows.length = 0

    const out = await cleanupBrainArtifactsForDocument('kb-s', 'doc-s', {
      atoms: atomRepo,
      events: eventRepo,
      edges: new KbKnowledgeEdgeRepository(ds),
      passes: passRepo,
      notes,
      vectors: { deleteByChunkIds: async (ids) => vectorRows.push(...ids.map((chunkId) => ({ chunkId, knowledgeBaseId: 'kb-s' }))) },
    })

    expect(out.atoms).toBe(atoms.length)
    expect(await atomRepo.findByDocument('doc-s', { lensNoteId: null })).toHaveLength(0)
    expect(await eventRepo.findByKb('kb-s')).toHaveLength(0)
    expect(await passRepo.listByDocument('doc-s')).toHaveLength(0)
    // 卡片保留但引用只剩另一文档的
    const updated = await notes.findById(note.id)
    expect(JSON.parse(updated!.evidence)).toEqual([{ documentId: 'doc-other', quote: 'other' }])
    expect(JSON.parse(updated!.patternInstances)).toEqual([{ documentId: 'doc-other', 参数: '权谋版' }])
    // 命名空间向量删除（atom:/event: 伪 chunkId）
    expect(vectorRows.some((r) => r.chunkId.startsWith('atom:'))).toBe(true)
    expect(vectorRows.some((r) => r.chunkId.startsWith('event:'))).toBe(true)
  })

  it('级联 fail-soft：单阶段抛错不阻断其余清理', async () => {
    const boom = { deleteByDocument: async () => { throw new Error('atoms 挂了') } }
    const okEvents = { deleteByDocument: async () => {}, findByDocument: async () => [{ id: 'e1' }] }
    const out = await cleanupBrainArtifactsForDocument('kb-x', 'doc-x', {
      atoms: boom,
      events: okEvents as never,
      edges: null,
      passes: { deleteByDocument: async () => {} },
      notes: { pruneDocumentReferences: async () => 2 },
      vectors: { deleteByChunkIds: async () => {} },
    })
    expect(out.atoms).toBe(0) // atoms 阶段失败
    expect(out.events).toBe(1) // 其余阶段照常
    expect(out.notesPruned).toBe(2)
  })
})

describe('AtomizeService.captureScenes', () => {
  it('窗口切分与 windowCalls 计数（长章多窗）', async () => {
    const calls: string[] = []
    const svc = new AtomizeService({
      llm: (async ({ system, user }) => {
        calls.push(system + ':' + user.length)
        expect(system).toContain('场面记录员')
        return SCENE_BACKFILL_RESP
      }) as BrainLlmFn,
    })
    const long = Array.from({ length: 700 }, (_, i) => `第${i}段。${SCENE_QUOTE}。`).join('\n')
    const out = await svc.captureScenes({ chapterTitle: '长章', chapterContent: long })
    expect(out.windowCalls).toBeGreaterThan(1)
    expect(out.scenes.length).toBeGreaterThan(0)
    expect(out.scenes.every((s) => s.startOffset !== null)).toBe(true)
  })
})
