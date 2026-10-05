/**
 * 书级汇总遍测试（§流程化提取）
 *
 * 覆盖：画像→关卡清单映射、台账幂等（章节指纹不变→跳过、变更→重汇总）、
 * 同题去重不重复提议、单遍失败不拖垮其他遍（fail-soft）、仓储不齐早退零调用。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import { KbBookPassesService, passesForProfile, type BookPassRepos } from '@core/platform/services/kb-brain/book-passes.service'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'
import { createKbBrainTestTables, insertTestKb, insertTestDoc } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

describe('KbBookPassesService', () => {
  let ds: DataSource
  let llmCalls: Array<{ system: string; user: string }>
  let llmReply = '## 主线梗概\n这是一段足够长的汇总正文，用于通过最短长度护栏检查，包含起承转合与关键转折的描述。'

  const BOOK_MD = '## 主线梗概\n（300字以上的正文……足够长以通过护栏）\n## 结构骨架\n第一卷——起步\n## 核心主题\n复仇与成长'

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
    await insertTestKb(ds, { id: 'kb-b', brainConfig: JSON.stringify({ enabled: true, profile: { contentType: 'novel' } }) })
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  function makeRepos(): BookPassRepos {
    llmCalls = []
    return {
      atoms: new KbAtomRepository(ds),
      entities: new KbEntityRepository(ds),
      notes: new KbNoteRepository(ds),
      docs: new KbDocumentRepository(ds),
      chapters: new KbChapterRepository(ds),
      passes: new KbDigestPassRepository(ds),
    }
  }

  function makeSvc(repos: BookPassRepos, reply = BOOK_MD): KbBookPassesService {
    llmReply = reply
    return new KbBookPassesService({
      llm: (async (req) => {
        llmCalls.push({ system: req.system, user: req.user })
        return llmReply
      }) as BrainLlmFn,
      repos: () => repos,
    })
  }

  async function plantNovel(docId = 'doc-b1'): Promise<void> {
    await insertTestDoc(ds, { id: docId, kbId: 'kb-b' })
    const chapters = new KbChapterRepository(ds)
    await chapters.replaceByDocument(docId, [1, 2, 3].map((i) => ({
      id: `${docId}-ch${i}`,
      documentId: docId,
      knowledgeBaseId: 'kb-b',
      title: `第${i}章`,
      level: 1,
      ordering: i,
      content: `第${i}章正文`,
      contentHash: `hash-b${i}`,
    })))
  }

  it('passesForProfile：画像→关卡映射（novel 4 关/knowledge 1 关/未识别仅概要）', () => {
    expect(passesForProfile('novel').map((p) => p.key)).toEqual(['book:outline', 'book:setting-index', 'book:character-roster', 'book:foreshadow-ledger'])
    expect(passesForProfile('knowledge').map((p) => p.key)).toEqual(['book:knowledge-map'])
    expect(passesForProfile('history').map((p) => p.key)).toEqual(['book:outline', 'book:character-roster'])
    expect(passesForProfile('')).toEqual([{ key: 'book:outline', name: '全书概要' }])
  })

  it('novel 全关：4 张卡进待审箱、4 遍台账 done；重复跑同指纹零 LLM 调用', async () => {
    await plantNovel()
    // 设定层论断 + 悬置点论断 + character 实体（roster 按本书论断的实体锚点取人物——
    // review P2 后人物册严格文档锚定，种子论断必须挂上实体）
    const ents = new KbEntityRepository(ds)
    const c1 = await ents.upsertMention('kb-b', { name: '程野', type: 'character' })
    const c2 = await ents.upsertMention('kb-b', { name: '苏晚', type: 'character' })
    await ents.replaceSummary(c1.id, '主角，复仇者。', 'done')
    const atoms = new KbAtomRepository(ds)
    await atoms.createBatch([
      { knowledgeBaseId: 'kb-b', statement: '修炼体系分九境', type: 'fact', sourceDocumentId: 'doc-b1', sourceQuote: 'q', layer: 'setting' },
      { knowledgeBaseId: 'kb-b', statement: '主角的身世之谜尚未揭晓', type: 'open-question', sourceDocumentId: 'doc-b1', sourceQuote: 'q' },
      { knowledgeBaseId: 'kb-b', statement: '程野是青岚宗杂役弟子', type: 'fact', sourceDocumentId: 'doc-b1', sourceQuote: 'q', subjectEntityId: c1.id },
      { knowledgeBaseId: 'kb-b', statement: '苏晚在舱内等候程野', type: 'fact', sourceDocumentId: 'doc-b1', sourceQuote: 'q', subjectEntityId: c2.id, objectEntityId: c1.id },
    ])

    const svc = makeSvc(makeRepos())
    await svc.runForDocument('kb-b', 'doc-b1', 'novel')
    // 4 关各至少 1 次调用（outline 3 章 ≤25 不分批 = 1 次；其余各 1）
    expect(llmCalls.length).toBe(4)
    const notes = new KbNoteRepository(ds)
    const proposed = await notes.listByStatus('kb-b', 'proposed', 1, 50)
    expect(proposed.rows.map((r: { type: string }) => r.type).sort()).toEqual(
      ['book-outline', 'character-roster', 'foreshadow-ledger', 'setting-index'].sort(),
    )
    const passes = new KbDigestPassRepository(ds)
    const rows = await passes.listByDocument('doc-b1')
    expect(rows.filter((r) => r.passType === 'book' && r.status === 'done')).toHaveLength(4)

    // 幂等：指纹未变 → 重跑零 LLM、卡不重复
    await svc.runForDocument('kb-b', 'doc-b1', 'novel')
    expect(llmCalls.length).toBe(4)
    const proposed2 = await notes.listByStatus('kb-b', 'proposed', 1, 50)
    expect(proposed2.total).toBe(4)
  }, 30000)

  it('章节变更（指纹变）→ 重汇总改写同题 proposed 卡（version+1，不新增卡）', async () => {
    await plantNovel('doc-b2')
    let callSeq = 0
    const repos = makeRepos()
    const svc = new KbBookPassesService({
      llm: (async () => {
        callSeq += 1
        return BOOK_MD + `\n\n第${callSeq}次汇总补充内容，用于区分前后两次正文，验证改写而非新建。`
      }) as BrainLlmFn,
      repos: () => repos,
    })
    await svc.runForDocument('kb-b', 'doc-b2', 'novel')
    const callsFirst = callSeq
    expect(callsFirst).toBeGreaterThanOrEqual(1)
    const notes = new KbNoteRepository(ds)
    const before = (await notes.listByStatus('kb-b', 'proposed', 1, 50)).rows.find(
      (r: { title: string }) => r.title === '《测试书-doc-b2》全书概要',
    ) as { id: string; version: number; body: string }
    expect(before).toBeTruthy()
    // 改一章内容 → 指纹变 → outline 重跑 → 同题 proposed 卡被改写（不新建）
    const chapters = new KbChapterRepository(ds)
    await chapters.replaceByDocument('doc-b2', [{
      id: 'doc-b2-ch1',
      documentId: 'doc-b2',
      knowledgeBaseId: 'kb-b',
      title: '第1章',
      level: 1,
      ordering: 0,
      content: '第1章正文（修改版）',
      contentHash: 'hash-b2-new',
    }])
    await svc.runForDocument('kb-b', 'doc-b2', 'novel')
    expect(callSeq).toBeGreaterThan(callsFirst)
    const after = await notes.findById(before.id)
    expect(after!.version).toBe(before.version + 1) // 改写而非新建
    expect(after!.body).not.toBe(before.body)
    const outlineCards = (await notes.listByStatus('kb-b', 'proposed', 1, 50)).rows.filter(
      (r: { title: string }) => r.title === '《测试书-doc-b2》全书概要',
    )
    expect(outlineCards).toHaveLength(1)
  }, 30000)

  it('单遍失败不拖垮其他遍（fail-soft），失败遍台账留错', async () => {
    await plantNovel('doc-b3')
    const repos = makeRepos()
    let callCount = 0
    const svc = new KbBookPassesService({
      llm: (async () => {
        callCount += 1
        if (callCount === 1) throw new Error('llm down') // 第一遍（outline）炸
        return BOOK_MD
      }) as BrainLlmFn,
      repos: () => repos,
    })
    await svc.runForDocument('kb-b', 'doc-b3', 'novel')
    const passes = new KbDigestPassRepository(ds)
    const rows = await passes.listByDocument('doc-b3')
    expect(rows.find((r) => r.passKey === 'book:outline')?.status).toBe('failed')
    expect(rows.filter((r) => r.passType === 'book' && r.status === 'done').length).toBeGreaterThanOrEqual(2)
    const notes = new KbNoteRepository(ds)
    expect((await notes.listByStatus('kb-b', 'proposed', 1, 50)).total).toBeGreaterThanOrEqual(2)
  }, 30000)

  it('仓储缺 notes → 早退零调用（防烧钱重试）', async () => {
    await plantNovel('doc-b4')
    const repos = makeRepos()
    const broken = { ...repos, notes: undefined as unknown as BookPassRepos['notes'] }
    const svc = makeSvc(broken)
    await svc.runForDocument('kb-b', 'doc-b4', 'novel')
    expect(llmCalls.length).toBe(0)
    const passes = new KbDigestPassRepository(ds)
    expect(await passes.listByDocument('doc-b4')).toHaveLength(0)
  })

  it('过短正文不成卡（宁缺勿滥）', async () => {
    await plantNovel('doc-b5')
    const svc = makeSvc(makeRepos(), '太短')
    await svc.runForDocument('kb-b', 'doc-b5', '') // 未识别 → 只有 outline
    const notes = new KbNoteRepository(ds)
    const proposed = await notes.listByStatus('kb-b', 'proposed', 1, 50)
    expect(proposed.rows.filter((r: { title: string }) => r.title.includes('doc-b5'))).toHaveLength(0)
    const passes = new KbDigestPassRepository(ds)
    expect((await passes.listByDocument('doc-b5')).find((r) => r.passKey === 'book:outline')?.status).toBe('done')
  })
})
