/**
 * 知识大脑消化编排器测试（T06：假 LLM + 假嵌入 + 内存库全链路）
 *
 * 覆盖：文档→章级消化全链（论断/实体挂点/倒排/事件边落库 + 台账 done）、
 * 幂等重跑、brainConfig 关闭 skipped、嵌入失败不阻塞、章节变更 stale 兜底。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// 生产路径（不注入 llm）走 simple-llm——M6 回归用例在此捕获真实 opts
const genMock = vi.fn()
vi.mock('@core/platform/services/simple-llm', () => ({
  generateCompletionText: (
    purpose: string,
    req: { system: string; user: string },
    opts: unknown
  ) => {
    genMock(purpose, req, opts)
    if (purpose === 'kb-brain-adjudicate') {
      return Promise.resolve(
        JSON.stringify({
          duplicates: [],
          contradictions: [],
          novel: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        })
      )
    }
    return Promise.resolve(ATOMIZE_RESPONSE)
  }
}))
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import { KbEventRepository } from '@core/database/repositories/kb-event.repository'
import { KbChunkRepository } from '@core/database/repositories/kb-chunk.repository'
import { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { KbInvertedIndexRepository } from '@core/database/repositories/kb-inverted-index.repository'
import {
  KbBrainDigestService,
  type KbBrainDigestDeps
} from '@core/platform/services/kb-brain/digest-orchestrator.service'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'
import {
  createKbBrainTestTables,
  insertTestKb,
  insertTestDoc
} from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

const ATOMIZE_RESPONSE = JSON.stringify({
  atoms: [
    {
      statement: '程野在第三卷失去左臂',
      type: 'fact',
      certainty: 0.9,
      quote: '他失去了左臂',
      subject: '程野'
    },
    { statement: '苏晚在舱内等候程野', type: 'fact', quote: '苏晚早已等候多时' }
  ],
  events: [{ fromQuote: '他失去了左臂', toQuote: '苏晚早已等候多时', evidence: '失臂后苏晚现身' }]
})

const CH1_CONTENT = '程野推开舱门。他失去了左臂。苏晚早已等候多时。'
const CH2_CONTENT = '船过三峡。江雾很重。'

describe('KbBrainDigestService 全链路', () => {
  let ds: DataSource
  let svc: KbBrainDigestService
  let llmCalls: Array<{ system: string; user: string }>
  let embedCalls: string[][]
  let atomRepo: KbAtomRepository
  let eventRepo: KbEventRepository

  const makeDeps = (): KbBrainDigestDeps => {
    const atoms = new KbAtomRepository(ds)
    atomRepo = atoms
    eventRepo = new KbEventRepository(ds)
    let embedded: KbEntityRepository | null = null
    return {
      llm: (async req => {
        llmCalls.push({ system: req.system, user: req.user })
        // 无候选时不触发裁决调用；有候选（ adjudicate prompt 含 NEW FACTS）返回全 novel
        if (req.system.includes('裁决员')) {
          const n = (req.user.match(/\[\d+\] /g) ?? []).length
          void n
          return JSON.stringify({
            duplicates: [],
            contradictions: [],
            novel: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
          })
        }
        return ATOMIZE_RESPONSE
      }) as BrainLlmFn,
      embed: async texts => {
        embedCalls.push(texts)
        return texts.map((_, i) => [i, 0.1, 0.2, 0.3])
      },
      repos: () => {
        const entitiesRepo = embedded ?? (embedded = new KbEntityRepository(ds))
        return {
          atoms,
          entities: entitiesRepo,
          edges: new KbKnowledgeEdgeRepository(ds),
          passes: new KbDigestPassRepository(ds),
          docs: new KbDocumentRepository(ds),
          chapters: new KbChapterRepository(ds),
          kbs: new KnowledgeBaseRepository(ds),
          chunks: new KbChunkRepository(ds),
          vectors: {
            createBatch: async () => {} // 假向量存储：记录由 embedCalls 断言
          },
          inverted: new KbInvertedIndexRepository(ds),
          events: eventRepo
        }
      }
    }
  }

  beforeAll(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: Object.values(entities).filter(v => typeof v === 'function') as EntityCtor[],
      synchronize: false,
      logging: false
    })
    await ds.initialize()
    // 生产语义：ALS 默认用户（Electron 启动即注入）——scoped 写入/查询都按此用户
    await createKbBrainTestTables(ds)

    await insertTestKb(ds, {
      id: 'kb-t',
      brainConfig: '{"enabled":true,"digestion":{"enabled":true}}'
    })
    await insertTestDoc(ds, { id: 'doc-t', kbId: 'kb-t' })

    llmCalls = []
    embedCalls = []
    svc = new KbBrainDigestService(makeDeps())
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  async function plantChapters(contentHash1: string): Promise<void> {
    const chapters = new KbChapterRepository(ds)
    await chapters.replaceByDocument('doc-t', [
      {
        id: 'ch-1',
        documentId: 'doc-t',
        knowledgeBaseId: 'kb-t',
        title: '第1章',
        level: 1,
        ordering: 0,
        content: CH1_CONTENT,
        contentHash: contentHash1
      },
      {
        id: 'ch-2',
        documentId: 'doc-t',
        knowledgeBaseId: 'kb-t',
        title: '第2章',
        level: 1,
        ordering: 1,
        content: CH2_CONTENT,
        contentHash: 'hash-ch2'
      }
    ])
  }

  it('全链路：文档消化 → 论断/挂点/倒排/边/台账/状态', async () => {
    await plantChapters('hash-ch1')
    await svc.enqueueDocument('doc-t', null)

    // 论断落库（ch2 零产出——ATOMIZE_RESPONSE 的 quote 在 ch2 内容中不命中，但 statement 仍落库）
    const atoms = await atomRepo.findByDocument('doc-t', { lensNoteId: null })
    expect(atoms.length).toBe(4) // 2 章 × 每章 2 论断

    // ch1 首论断定位正确
    const first = atoms.find(a => a.statement === '程野在第三卷失去左臂')!
    expect(first.sourceChapterId).toBe('ch-1')
    expect(first.sourceChapterHash).toBe('hash-ch1')
    expect(first.startOffset).toBe(CH1_CONTENT.indexOf('他失去了左臂'))

    // 实体挂点：程野 被解析并回填（摘要可能已把状态推成 done——用名称查）
    const entRepo = new KbEntityRepository(ds)
    const chengye = (await entRepo.findByName('kb-t', ['程野'])).find(e => e.name === '程野')
    expect(chengye).toBeTruthy()
    const firstReloaded = await atomRepo.findById(first.id)
    expect(firstReloaded?.subjectEntityId).toBe(chengye!.id)

    // 倒排行存在（chunkId = atom:<id>，带命名空间前缀——review F1 修复）
    const invRows = (await ds.query(
      `SELECT COUNT(*) as count FROM kb_inverted_index WHERE chunk_id = 'atom:${first.id}'`
    )) as Array<{ count: number }>
    expect(Number(invRows[0].count)).toBeGreaterThan(0)

    // leads-to 边（ch1 内一对）
    const edges = await new KbKnowledgeEdgeRepository(ds).neighborsOf('kb-t', [first.id])
    expect(edges.some(e => e.relation === 'leads-to')).toBe(true)

    // 台账：两章 done（base 遍；场面轨 events#1 另记零产出行——无 scenes 也记 done 防每轮重扫）
    const passRepo = new KbDigestPassRepository(ds)
    const passRows = await passRepo.listByDocument('doc-t')
    expect(passRows.filter(p => p.status === 'done' && p.passType === 'base')).toHaveLength(2)
    expect(passRows.filter(p => p.status === 'done' && p.passType === 'events')).toHaveLength(2)
    expect(passRows.every(p => p.attempts === 1)).toBe(true)

    // 文档状态 digested
    const docRow = (await ds.query(
      `SELECT brain_status, brain_progress FROM kb_documents WHERE id='doc-t'`
    )) as Array<{ brain_status: string; brain_progress: number }>
    expect(docRow[0].brain_status).toBe('digested')
    expect(docRow[0].brain_progress).toBe(100)

    // 假嵌入被调用（两次章消化 + 实体摘要各实体一次）
    expect(embedCalls.length).toBeGreaterThanOrEqual(2)
  }, 30000)

  it('幂等重跑：同 hash 二次触发不新增论断、不再调 LLM', async () => {
    const before = llmCalls.length
    const countBefore = (await atomRepo.findByDocument('doc-t', { lensNoteId: null })).length
    await svc.enqueueDocument('doc-t', null)
    const countAfter = (await atomRepo.findByDocument('doc-t', { lensNoteId: null })).length
    expect(countAfter).toBe(countBefore)
    expect(llmCalls.length).toBe(before) // 台账 done-same-hash 全跳过
  })

  it('brainConfig 关闭 → skipped', async () => {
    await ds.query(`UPDATE knowledge_bases SET brain_config='{"enabled":false}' WHERE id='kb-t'`)
    await svc.enqueueDocument('doc-t', null)
    const docRow = (await ds.query(
      `SELECT brain_status FROM kb_documents WHERE id='doc-t'`
    )) as Array<{ brain_status: string }>
    expect(docRow[0].brain_status).toBe('skipped')
    await ds.query(
      `UPDATE knowledge_bases SET brain_config='{"enabled":true,"digestion":{"enabled":true}}' WHERE id='kb-t'`
    )
  })

  it('嵌入失败 → 论断仍落库（stats 记 vectorsFailed），台账 done', async () => {
    // 新文档专门测嵌入失败
    await insertTestDoc(ds, { id: 'doc-emb', kbId: 'kb-t' })
    const chapters = new KbChapterRepository(ds)
    await chapters.replaceByDocument('doc-emb', [
      {
        id: 'ch-e1',
        documentId: 'doc-emb',
        knowledgeBaseId: 'kb-t',
        title: '第1章',
        level: 1,
        ordering: 0,
        content: CH1_CONTENT,
        contentHash: 'hash-e1'
      }
    ])
    const failing = new KbBrainDigestService({
      ...makeDeps(),
      embed: async () => null
    })
    await failing.enqueueDocument('doc-emb', null)
    const atoms = await atomRepo.findByDocument('doc-emb', { lensNoteId: null })
    expect(atoms.length).toBe(2)
    const passRows = await new KbDigestPassRepository(ds).listByDocument('doc-emb')
    expect(passRows[0].status).toBe('done')
    const stats = JSON.parse(passRows[0].statsJson ?? '{}') as { vectorsFailed: number }
    expect(stats.vectorsFailed).toBe(2)
  })

  it('autoApproveThreshold：低于阈值的论断标 suspected 待人审（§3.3）', async () => {
    await insertTestDoc(ds, { id: 'doc-thr', kbId: 'kb-t' })
    await ds.query(
      `UPDATE knowledge_bases SET brain_config='{"enabled":true,"digestion":{"enabled":true},"autoApproveThreshold":0.95}' WHERE id='kb-t'`
    )
    const chapters = new KbChapterRepository(ds)
    await chapters.replaceByDocument('doc-thr', [
      {
        id: 'ch-thr',
        documentId: 'doc-thr',
        knowledgeBaseId: 'kb-t',
        title: '第1章',
        level: 1,
        ordering: 0,
        content: CH1_CONTENT,
        contentHash: 'hash-thr'
      }
    ])
    //ATOMIZE_RESPONSE certainty=0.9 < 0.95 → suspected
    const thr = new KbBrainDigestService(makeDeps())
    await thr.enqueueDocument('doc-thr', null)
    const atoms2 = await atomRepo.findByDocument('doc-thr', { lensNoteId: null })
    expect(atoms2.length).toBeGreaterThan(0)
    expect(atoms2.every(a => a.status === 'suspected')).toBe(true)
    await ds.query(
      `UPDATE knowledge_bases SET brain_config='{"enabled":true,"digestion":{"enabled":true}}' WHERE id='kb-t'`
    )
  })

  it('章节内容变更 → 重跑旧论断 stale、新论断 supported', async () => {
    const oldAtoms = (await atomRepo.findByDocument('doc-t', { lensNoteId: null })).filter(
      a => a.sourceChapterId === 'ch-1'
    )
    // 修改 ch1 内容与 hash（reprocess 语义）
    const chapters = new KbChapterRepository(ds)
    await chapters.replaceByDocument('doc-t', [
      {
        id: 'ch-1b',
        documentId: 'doc-t',
        knowledgeBaseId: 'kb-t',
        title: '第1章',
        level: 1,
        ordering: 0,
        content: '全新剧情：程野双臂完好。',
        contentHash: 'hash-ch1-new'
      },
      {
        id: 'ch-2',
        documentId: 'doc-t',
        knowledgeBaseId: 'kb-t',
        title: '第2章',
        level: 1,
        ordering: 1,
        content: CH2_CONTENT,
        contentHash: 'hash-ch2'
      }
    ])
    await svc.enqueueDocument('doc-t', null)
    for (const old of oldAtoms) {
      expect((await atomRepo.findById(old.id))?.status).toBe('stale')
    }
    const newAtoms = await atomRepo.findByDocument('doc-t', { lensNoteId: null })
    const fresh = newAtoms.filter(a => a.sourceChapterHash === 'hash-ch1-new')
    expect(fresh.length).toBeGreaterThan(0)
    expect(fresh.every(a => a.status === 'supported')).toBe(true)
  })

  it('手动重试：耗尽章（attempts>=3）复活后可完成（reviveExhaustedChapters）', async () => {
    const chapters = new KbChapterRepository(ds)
    await chapters.replaceByDocument('doc-t', [
      {
        id: 'ch-r',
        documentId: 'doc-t',
        knowledgeBaseId: 'kb-t',
        title: '重试章',
        level: 1,
        ordering: 0,
        content: '全新重试剧情内容。',
        contentHash: 'hash-retry'
      }
    ])
    // LLM 一直炸 → 连跑 3 次 → 章耗尽、文档 failed
    const badDeps = makeDeps()
    badDeps.llm = (async () => {
      throw new Error('provider down')
    }) as BrainLlmFn
    const bad = new KbBrainDigestService(badDeps)
    for (let i = 0; i < 3; i++) await bad.digestDocument('doc-t')
    const passRow = (await ds.query(
      "SELECT status, attempts FROM kb_digest_passes WHERE chapter_id='ch-r'"
    )) as Array<{ status: string; attempts: number }>
    expect(passRow[0].status).toBe('failed')
    expect(Number(passRow[0].attempts)).toBeGreaterThanOrEqual(3)

    // 复活 + 好 LLM 重跑 → 文档 digested、论断落库
    const revived = await svc.reviveExhaustedChapters('doc-t')
    expect(revived).toBeGreaterThan(0)
    const resetRow = (await ds.query(
      "SELECT status FROM kb_digest_passes WHERE chapter_id='ch-r'"
    )) as Array<{ status: string }>
    expect(resetRow[0].status).toBe('pending')
    const good = new KbBrainDigestService(makeDeps())
    await good.digestDocument('doc-t')
    const docRow = (await ds.query(
      "SELECT brain_status FROM kb_documents WHERE id='doc-t'"
    )) as Array<{ brain_status: string }>
    expect(docRow[0].brain_status).toBe('digested')
  })
})

describe('KbBrainDigestService 生产路径每库模型（M6 回归）', () => {
  let ds2: DataSource

  beforeAll(async () => {
    ds2 = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: Object.values(entities).filter(v => typeof v === 'function') as EntityCtor[],
      synchronize: false,
      logging: false
    })
    await ds2.initialize()
    await createKbBrainTestTables(ds2)
  })

  afterAll(async () => {
    await ds2?.destroy()
  })

  it('不注入 llm 时：atomize/adjudicate 全部 LLM 调用携带 brainConfig.models 的每库模型', async () => {
    const { defaultBrainConfig, mergeBrainConfig, stringifyBrainConfig } =
      await import('@core/platform/services/kb-brain/brain-config')
    const cfg = mergeBrainConfig(defaultBrainConfig(true), {
      models: { atomize: 'prov-atom:model-atom', adjudicate: 'prov-adj:model-adj' }
    })
    await insertTestKb(ds2, { id: 'kb-m6', brainConfig: stringifyBrainConfig(cfg) })
    await insertTestDoc(ds2, { id: 'doc-m6', kbId: 'kb-m6' })
    const chapters = new KbChapterRepository(ds2)
    await chapters.replaceByDocument('doc-m6', [
      {
        id: 'ch-m6',
        documentId: 'doc-m6',
        knowledgeBaseId: 'kb-m6',
        title: '第一章',
        level: 1,
        ordering: 0,
        content: CH1_CONTENT
      }
    ])

    genMock.mockClear()
    const svc2 = new KbBrainDigestService({
      embed: async texts => texts.map((_, i) => [i, 0.1, 0.2, 0.3]),
      repos: () =>
        ({
          atoms: new KbAtomRepository(ds2),
          entities: new KbEntityRepository(ds2),
          edges: new KbKnowledgeEdgeRepository(ds2),
          passes: new KbDigestPassRepository(ds2),
          docs: new KbDocumentRepository(ds2),
          chapters,
          kbs: new KnowledgeBaseRepository(ds2),
          chunks: new KbChunkRepository(ds2),
          vectors: { createBatch: async () => {} },
          inverted: new KbInvertedIndexRepository(ds2),
          notes: undefined as never
        }) as never
    })
    await svc2.digestDocument('doc-m6')

    // 全链路至少发生过两种档位的真实调用
    expect(genMock).toHaveBeenCalled()
    const atomCalls = genMock.mock.calls.filter(c => c[0] === 'kb-brain-atomize')
    const adjCalls = genMock.mock.calls.filter(c => c[0] === 'kb-brain-adjudicate')
    expect(atomCalls.length).toBeGreaterThan(0)
    expect(adjCalls.length).toBeGreaterThan(0)
    // 每库模型必须逐调用生效——修复前 digest 链路恒传 env-only llm，
    // cfg.models.* 形同虚设（会落在宿主默认/空 opts 上）
    for (const c of atomCalls) {
      expect((c[2] as { providerConfigId?: string; modelId?: string }).modelId).toBe('model-atom')
      expect((c[2] as { providerConfigId?: string }).providerConfigId).toBe('prov-atom')
    }
    for (const c of adjCalls) {
      expect((c[2] as { providerConfigId?: string; modelId?: string }).modelId).toBe('model-adj')
      expect((c[2] as { providerConfigId?: string }).providerConfigId).toBe('prov-adj')
    }
  })
})
