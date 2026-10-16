/**
 * 书级归并产线测试（v4 整书结构化漏斗）
 *
 * 覆盖：画像→关卡清单映射、漏斗全流程（名册/编年段/主线/人物档案/设定档案/
 * 伏笔线/文风/覆盖记账）、台账幂等（同指纹零 LLM）、同题卡演进（proposed 更新
 * 不新增）、单遍失败不拖垮（fail-soft）、审校修复回路（问题→单元重跑）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import { KbBrainArtifactRepository } from '@core/database/repositories/kb-brain-artifact.repository'
import {
  KbBookPassesService,
  passesForProfile,
  planChronicleSegments,
  packSections,
  foreshadowCandidateClusters,
  deriveForeshadowStatus,
  computeCoverage,
  type BookPassRepos,
  type CardEntry,
} from '@core/platform/services/kb-brain/book-passes.service'
import {
  CHRONICLE_SYSTEM,
  VOLUME_SYSTEM,
  CHARACTER_DOSSIER_SYSTEM,
  WORLD_DOSSIER_SYSTEM,
  ROSTER_PART_SYSTEM,
  FORESHADOW_LINES_SYSTEM,
  STYLE_PROFILE_SYSTEM,
  BOOK_OUTLINE_REDUCE_SYSTEM,
  BOOK_REVIEW_SYSTEM,
} from '@core/platform/services/kb-brain/prompts'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'
import { createKbBrainTestTables, insertTestKb, insertTestDoc } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

const LONG_MD =
  '## 主线梗概\n这是一段足够长的汇总正文，用于通过最短长度护栏检查，包含起承转合与关键转折的描述，字数超过三十个字符的门槛线。'

function novelCard(ch: number, summary: string) {
  return {
    v: 1,
    profile: 'novel' as const,
    summary,
    events: [`第${ch}章事件`],
    characters: [
      { name: '程野', facts: [{ t: `程野第${ch}章长效事实`, ch }] },
      { name: '苏晚', facts: [{ t: `苏晚第${ch}章长效事实`, ch }] },
    ],
    world: [{ domain: '势力', name: '青云门', facts: [{ t: `青云门规则${ch}`, ch }] }],
    foreshadow: ch === 1 ? [{ label: '古钟之谜', action: 'plant' as const, t: '古钟异响', ch }] : [],
    style: [{ t: '以景写情', why: '克制' }],
  }
}

describe('KbBookPassesService（v4 漏斗）', () => {
  let ds: DataSource
  let llmCalls: Array<{ system: string; user: string }>
  let llmOverride: Map<string, string> | null = null

  const scriptedLlm = ((): BrainLlmFn =>
    (async (req) => {
      llmCalls.push({ system: req.system, user: req.user })
      if (llmOverride) {
        for (const [key, reply] of llmOverride) {
          if (req.system.includes(key)) return reply
        }
      }
      if (req.system.includes(CHRONICLE_SYSTEM.slice(0, 12)))
        return JSON.stringify({
          summary: '本段梗概：主角起步与门派规则铺垫，包含一次关键冲突。',
          points: [{ title: '入门', summary: '程野入青云门', startCh: 1, endCh: 2 }],
        })
      if (req.system.includes(VOLUME_SYSTEM.slice(0, 12)))
        return JSON.stringify({ summary: '第一卷卷梗概：起步与冲突，收束于古钟异响。', turns: ['第2章 转折'] })
      if (req.system.includes(CHARACTER_DOSSIER_SYSTEM.slice(0, 12)))
        return JSON.stringify({
          summary: '复仇者。',
          coreProfile: '青云门弟子，性坚忍，为复仇而修行——全书稳定特征。',
          relationships: '与苏晚同门（第1章）；与师父师承（第2章）。',
          latestState: '仍在门中修行。',
          timeline: '第1章入门；第2章立誓。',
        })
      if (req.system.includes(WORLD_DOSSIER_SYSTEM.slice(0, 12)))
        return JSON.stringify({ overview: '门派与地理格局概览。', items: [{ title: '青云门', content: '正道门派，门规森严（第1章）。' }] })
      if (req.system.includes(ROSTER_PART_SYSTEM.slice(0, 12)))
        return JSON.stringify({
          groups: [],
          tiers: [
            { ref: 0, tier: 'protagonist', reason: '全程在场' },
            { ref: 1, tier: 'minor', reason: '次要配角' },
            { ref: 2, tier: 'core', reason: '核心势力' },
          ],
          categories: [{ ref: 2, category: '势力' }],
        })
      if (req.system.includes(FORESHADOW_LINES_SYSTEM.slice(0, 12))) return JSON.stringify({ groups: [] })
      if (req.system.includes(STYLE_PROFILE_SYSTEM.slice(0, 12))) return LONG_MD
      if (req.system.includes(BOOK_REVIEW_SYSTEM.slice(0, 12))) return JSON.stringify({ issues: [] })
      if (req.system.includes(BOOK_OUTLINE_REDUCE_SYSTEM.slice(0, 12))) return LONG_MD
      return LONG_MD
    }) as BrainLlmFn)()

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
    llmOverride = null
    return {
      entities: new KbEntityRepository(ds),
      notes: new KbNoteRepository(ds),
      docs: new KbDocumentRepository(ds),
      chapters: new KbChapterRepository(ds),
      passes: new KbDigestPassRepository(ds),
      artifacts: new KbBrainArtifactRepository(ds),
    }
  }

  function makeSvc(repos: BookPassRepos): KbBookPassesService {
    return new KbBookPassesService({ llm: scriptedLlm, repos: () => repos })
  }

  async function plantNovel(docId: string, chapterCount = 3, withCards = true): Promise<void> {
    await insertTestDoc(ds, { id: docId, kbId: 'kb-b' })
    const chapters = new KbChapterRepository(ds)
    await chapters.replaceByDocument(
      docId,
      Array.from({ length: chapterCount }, (_, i) => ({
        id: `${docId}-ch${i + 1}`,
        documentId: docId,
        knowledgeBaseId: 'kb-b',
        title: `第${i + 1}章`,
        level: 1,
        ordering: i + 1,
        content: `第${i + 1}章正文，内容足够长以通过抽样与文风截取检查。`,
        contentHash: `hash-${docId}-${i + 1}`,
      }))
    )
    if (withCards) {
      for (let i = 1; i <= chapterCount; i++) {
        const card = novelCard(i, `第${i}章：程野在青云门修行，苏晚同行，门规森严。`)
        await chapters.updateBrainCard(`${docId}-ch${i}`, { card: JSON.stringify(card), hash: `card-${docId}-${i}` })
      }
    }
  }

  it('passesForProfile：画像→关卡清单（v4 含过程关：名册/编年段/审校/覆盖）', () => {
    expect(passesForProfile('novel').map((p) => p.key)).toEqual([
      'roster',
      'chronicle',
      'volume',
      'book:outline',
      'book:character-roster',
      'book:setting-index',
      'book:foreshadow-ledger',
      'style',
      'review',
      'coverage',
    ])
    expect(passesForProfile('knowledge').map((p) => p.key)).toEqual([
      'roster',
      'chronicle',
      'book:outline',
      'book:knowledge-map',
      'review',
      'coverage',
    ])
    expect(passesForProfile('').map((p) => p.key)).toEqual(['chronicle', 'book:outline', 'coverage'])
  })

  it('novel 漏斗全流程：名册/档案/群像/设定/伏笔线/文风/主线全部出卡，覆盖账本落工件', async () => {
    await plantNovel('doc-v4')
    const repos = makeRepos()
    const svc = makeSvc(repos)
    await svc.runForDocument('kb-b', 'doc-v4', 'novel')

    const notes = new KbNoteRepository(ds)
    const { rows: proposed } = await notes.listByStatus('kb-b', 'proposed', 1, 50)
    const titles = proposed.map((r) => r.title)
    expect(titles).toContain('《测试书-doc-v4》名册')
    expect(titles).toContain('《测试书-doc-v4》全书概要')
    expect(titles.some((t) => t?.includes('人物档案：'))).toBe(true)
    expect(titles).toContain('《测试书-doc-v4》人物册（次要配角群像）')
    expect(titles).toContain('《测试书-doc-v4》设定索引')
    expect(titles.some((t) => t?.includes('设定档案：势力'))).toBe(true)
    expect(titles).toContain('《测试书-doc-v4》伏笔台账')
    expect(titles).toContain('《测试书-doc-v4》文风画像')

    const artifacts = new KbBrainArtifactRepository(ds)
    const rosterArtifact = await artifacts.findByKey('doc-v4', 'roster')
    expect(rosterArtifact).toBeTruthy()
    const snapshot = JSON.parse(rosterArtifact!.body ?? '{}')
    expect(snapshot.characters.length).toBe(2)
    expect(snapshot.status).toBe('auto')

    const coverage = await artifacts.findByKey('doc-v4', 'coverage')
    expect(coverage).toBeTruthy()
    const report = JSON.parse(coverage!.body ?? '{}')
    expect(report.totals.withCard).toBe(3)

    // 伏笔线：第1章 plant → open 状态
    const ledger = proposed.find((r) => r.title === '《测试书-doc-v4》伏笔台账')
    expect(ledger?.body).toContain('古钟之谜')
    expect(ledger?.body).toContain('未回收')

    // 全部书级遍台账 done
    const passes = new KbDigestPassRepository(ds)
    const rows = await passes.listByDocument('doc-v4')
    const bookRows = rows.filter((r) => r.passType === 'book')
    expect(bookRows.length).toBeGreaterThan(5)
    expect(bookRows.every((r) => r.status === 'done')).toBe(true)
  })

  it('台账幂等：同指纹重跑零 LLM 调用', async () => {
    await plantNovel('doc-v4i')
    const repos = makeRepos()
    const svc = makeSvc(repos)
    await svc.runForDocument('kb-b', 'doc-v4i', 'novel')
    const afterFirst = llmCalls.length
    expect(afterFirst).toBeGreaterThan(0)
    await svc.runForDocument('kb-b', 'doc-v4i', 'novel')
    expect(llmCalls.length).toBe(afterFirst)
  })

  it('同题卡演进：章节变更重汇总 → proposed 卡更新（version+1）不新增', async () => {
    await plantNovel('doc-v4u')
    const repos = makeRepos()
    const svc = makeSvc(repos)
    await svc.runForDocument('kb-b', 'doc-v4u', 'novel')
    const notes = new KbNoteRepository(ds)
    const { rows: before } = await notes.listByStatus('kb-b', 'proposed', 1, 50)
    const outlineBefore = before.find((r) => r.title === '《测试书-doc-v4u》全书概要')
    expect(outlineBefore).toBeTruthy()

    // 追加第 4 章（带卡）→ 指纹变 → 重汇总
    const chapters = new KbChapterRepository(ds)
    await chapters.replaceByDocument(
      'doc-v4u',
      Array.from({ length: 4 }, (_, i) => ({
        id: `doc-v4u-ch${i + 1}`,
        documentId: 'doc-v4u',
        knowledgeBaseId: 'kb-b',
        title: `第${i + 1}章`,
        level: 1,
        ordering: i + 1,
        content: `第${i + 1}章正文，内容足够长。`,
        contentHash: `hash-new-${i + 1}`,
      }))
    )
    for (let i = 1; i <= 4; i++) {
      const card = novelCard(i, `第${i}章：程野修行（新卷）。`)
      await chapters.updateBrainCard(`doc-v4u-ch${i}`, { card: JSON.stringify(card), hash: `card-new-${i}` })
    }
    llmCalls = []
    await svc.runForDocument('kb-b', 'doc-v4u', 'novel')
    const { rows: after } = await notes.listByStatus('kb-b', 'proposed', 1, 50)
    const outlines = after.filter((r) => r.title === '《测试书-doc-v4u》全书概要')
    expect(outlines.length).toBe(1)
    expect(outlines[0]!.version).toBeGreaterThan(outlineBefore!.version)
  })

  it('单遍失败不拖垮（fail-soft）：编年段产物坏 → 主线降级可用，失败遍台账留错', async () => {
    await plantNovel('doc-v4f')
    const repos = makeRepos()
    llmOverride = new Map([['编年员', '这不是合法 JSON']])
    const svc = makeSvc(repos)
    await svc.runForDocument('kb-b', 'doc-v4f', 'novel')

    const passes = new KbDigestPassRepository(ds)
    const rows = await passes.listByDocument('doc-v4f')
    const chronicleRow = rows.find((r) => r.passKey === 'chronicle')
    expect(chronicleRow?.status).toBe('failed')
    // 主线仍产出（降级吃章卡摘要）
    const notes = new KbNoteRepository(ds)
    const { rows: proposed } = await notes.listByStatus('kb-b', 'proposed', 1, 50)
    expect(proposed.some((r) => r.title === '《测试书-doc-v4f》全书概要')).toBe(true)
  })

  it('审校修复：问题指向 book:outline → 台账复位并重跑（同题卡更新、审校工件落盘）', async () => {
    await plantNovel('doc-v4r')
    const repos = makeRepos()
    llmOverride = new Map([
      [
        '审校员',
        JSON.stringify({
          issues: [{ unitKey: 'book:outline', description: '主线与剧情点错位', chapterOrders: [2], suggestion: '补第2章转折' }],
        }),
      ],
    ])
    const svc = makeSvc(repos)
    await svc.runForDocument('kb-b', 'doc-v4r', 'novel')

    const artifacts = new KbBrainArtifactRepository(ds)
    const review = await artifacts.findByKey('doc-v4r', 'review:剧情')
    expect(review).toBeTruthy()
    const report = JSON.parse(review!.body ?? '{}')
    expect(report.issues.length).toBe(1)

    // 修复后 outline 卡仍是一张（proposed 更新语义）
    const notes = new KbNoteRepository(ds)
    const { rows: proposed } = await notes.listByStatus('kb-b', 'proposed', 1, 50)
    expect(proposed.filter((r) => r.title === '《测试书-doc-v4r》全书概要').length).toBe(1)
  })

  it('runReviews：时间桶指纹跨日复审，同日幂等', async () => {
    await plantNovel('doc-v4rr')
    const repos = makeRepos()
    const svc = makeSvc(repos)
    await svc.runForDocument('kb-b', 'doc-v4rr', 'novel')
    llmCalls = []
    const out = await svc.runReviews('kb-b', 'novel', ['doc-v4rr'])
    expect(out.docs).toBe(1)
    expect(llmCalls.length).toBeGreaterThan(0)
    llmCalls = []
    await svc.runReviews('kb-b', 'novel', ['doc-v4rr'])
    expect(llmCalls.length).toBe(0)
  })
})

describe('v4 漏斗纯函数', () => {
  const entry = (no: number, volume: string | null = null): CardEntry => ({
    card: novelCard(no, `第${no}章梗概`),
    chapterNo: no,
    chapterId: `ch${no}`,
    title: `第${no}章`,
    volume,
  })

  it('planChronicleSegments：不跨卷、预算封顶', () => {
    const segs = planChronicleSegments([entry(1, '第一卷'), entry(2, '第一卷'), entry(3, '第二卷')], { perChapterChars: 1200 })
    expect(segs.length).toBe(2)
    expect(segs[0]!.volume).toBe('第一卷')
    expect(segs[1]!.volume).toBe('第二卷')
    const budgetSplit = planChronicleSegments([entry(1), entry(2), entry(3)], { budgetChars: 2500, perChapterChars: 1200 })
    expect(budgetSplit.length).toBe(2)
  })

  it('packSections：预算内全量；超预算均匀抽样并注明', () => {
    const small = packSections([{ title: 'A', lines: ['l1', 'l2'] }], 1000)
    expect(small).toContain('l1')
    expect(small).not.toContain('抽样')
    const big = packSections(
      [{ title: 'A', lines: Array.from({ length: 100 }, (_, i) => `第${i}行内容足够长才能触发抽样机制`.repeat(2)) }],
      600
    )
    expect(big).toContain('抽样')
  })

  it('foreshadowCandidateClusters：互为包含或同前缀才成簇', () => {
    const out = foreshadowCandidateClusters(['古钟之谜', '古钟之谜·下', '另一条线'])
    expect(out.length).toBe(1)
    expect(out[0]).toContain('古钟之谜')
  })

  it('deriveForeshadowStatus：reveal/payoff→resolved；partial_reveal→partial；否则 open', () => {
    expect(deriveForeshadowStatus([{ action: 'plant', ch: 1, note: '' }])).toBe('open')
    expect(deriveForeshadowStatus([{ action: 'plant', ch: 1, note: '' }, { action: 'partial_reveal', ch: 5, note: '' }])).toBe('partial')
    expect(deriveForeshadowStatus([{ action: 'plant', ch: 1, note: '' }, { action: 'payoff', ch: 9, note: '' }])).toBe('resolved')
  })

  it('computeCoverage：缺口可计数', () => {
    const report = computeCoverage({
      totalChapters: 5,
      narrativeChapters: 4,
      cardChapterNos: new Set([1, 2]),
      segmentChapters: new Set([1]),
      volumeChapters: new Set(),
      cardNames: new Set(['甲', '乙']),
      rosterNames: new Set(['甲']),
      sampling: [],
    })
    expect(report.totals.withCard).toBe(2)
    expect(report.gaps.some((g) => g.kind === 'card-missing')).toBe(true)
    expect(report.gaps.some((g) => g.kind === 'name-unassigned')).toBe(true)
  })
})
