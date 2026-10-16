/**
 * 知识大脑·书级归并产线（v4 整书结构化漏斗；取代 v1「论断池抽样拼卡」）
 * @module platform/services/kb-brain/book-passes.service
 *
 * 漏斗：章卡（全量）→ 编年段（章→段）→ 卷（段→卷）→ 书级成品（卷→书）。
 * 全部取材走证据包组装（预算配额，硬上限退役）；过程产物（编年段/卷/名册/覆盖）
 * 落 kb_brain_artifacts 工件表，成品才进知识卡（同题卡语义沿用：proposed 演进、
 * published 不覆盖）。
 *
 * 关卡顺序即依赖序（画像驱动）：
 *   roster（名册：聚合/裁决/分级/收件箱人审卡）
 *   → chronicle（编年段 artifacts）→ volume（卷梗概 artifacts）
 *   → book:outline（全书主线，吃卷/段）→ book:character-roster（次要群像卡
 *     + 主角/主要配角逐人档案卡 character-dossier）→ book:setting-index（索引卡
 *     + 逐类别设定档案卡 setting-dossier）→ book:foreshadow-ledger（伏笔线卡）
 *   → style（文风画像，novel）→ book:knowledge-map（knowledge）→ coverage（程序记账）
 *
 * 纪律：单遍失败不影响其他遍与消化主状态（fail-soft）；全部遍有台账幂等
 * （chapterHash=章节集合指纹+画像）；工件替换式更新不膨胀。
 */
import { createHash } from 'crypto'
import { createLogger } from '@core/utils/logger'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { KbBrainArtifactRepository } from '@core/database/repositories/kb-brain-artifact.repository'
import type { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import {
  BOOK_OUTLINE_REDUCE_SYSTEM,
  BOOK_SETTING_INDEX_SYSTEM,
  BOOK_KNOWLEDGE_MAP_SYSTEM,
  BOOK_ROSTER_SYSTEM,
  CHRONICLE_SYSTEM,
  VOLUME_SYSTEM,
  CHARACTER_DOSSIER_SYSTEM,
  WORLD_DOSSIER_SYSTEM,
  FORESHADOW_LINES_SYSTEM,
  STYLE_PROFILE_SYSTEM,
  buildChronicleUser,
  buildVolumeUser,
  buildCharacterDossierUser,
  buildWorldDossierUser,
  buildStyleProfileUser,
} from './prompts'
import { createKbScopedLlm, BRAIN_LLM_MAX_TOKENS, type BrainLlmFn, type BrainModelRef, type KbScopedLlm } from './llm'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { parseCard } from './reading-card.service'
import { BOOK_REVIEW_SYSTEM, buildBookReviewUser } from './prompts'
import { parseReviewIssues, type ReviewIssue } from './schemas'
import {
  KbRosterService,
  renderRosterMarkdown,
  type CardWithChapter,
  type RosterSnapshot,
  type RosterEntry,
} from './roster.service'
import type { ReadingCard } from './schemas'

const logger = createLogger('KbBrainBookPasses')

/** 书级证据包预算（字符；provider 侧无窗口元数据，用字符预算 env 覆盖——滚动阅读先例） */
const BOOK_EVIDENCE_CHARS = Number(process.env.KB_BOOK_EVIDENCE_CHARS ?? '') || 24000
/** 编年段切分的单章卡体量估算（保守值） */
const CHARS_PER_CHAPTER_CARD = 1200
/** 单段章数上限（保段内主题聚合度） */
const CHRONICLE_MAX_CHAPTERS = 40
/** 卡正文长度护栏（嵌入与面板渲染友好） */
const CARD_BODY_MAX = 20000
/** 单书人物档案数上限（护栏：主角+主要配角异常多的书；超出记覆盖账本） */
const DOSSIER_CAP = 30
/** 单书设定档案类别数上限 */
const WORLD_CATEGORY_CAP = 12
/** 次要配角群像每组人数 */
const MINOR_GROUP_SIZE = 10
/** 伏笔线数上限 */
const FORESHADOW_LINE_CAP = 120
/** 文风抽样片段字数 */
const STYLE_EXCERPT_CHARS = 300

/** 章节消费形态（含卡与卷归属） */
export interface BookChapter {
  id: string
  title: string
  ordering: number
  parentTitle: string | null
  content: string | null
  contentHash: string | null
  brainCard: string | null
  summary?: string | null
}

export interface BookPassRepos {
  entities: Pick<KbEntityRepository, 'upsertMention' | 'merge'>
  notes: {
    findSimilarTitle(
      kbId: string,
      title: string
    ): Promise<Array<{ id?: string; title?: string; status?: string }>>
    /** 按状态列卡（审校取材；旧库缺省时审校降级只用工件材料） */
    listByStatus?(
      kbId: string,
      status: string,
      page: number,
      limit: number,
      type?: string
    ): Promise<{ rows: Array<{ title?: string; description?: string; body?: string }> }>
    propose(
      kbId: string,
      input: {
        title: string
        description: string
        body?: string
        type: string
        evidence?: string
        origin?: string
      }
    ): Promise<unknown>
    updateProposedBody?(id: string, patch: { body: string; description?: string }): Promise<unknown>
  }
  docs: { findById(id: string): Promise<{ name: string } | null> }
  chapters: {
    findByDocument(
      documentId: string,
      opts?: { includeContent?: boolean; includeCard?: boolean }
    ): Promise<Array<{ id: string; title: string; ordering: number; parentTitle?: string | null; content: string | null; summary?: string | null; contentHash: string | null; brainCard?: string | null }>>
  }
  passes: {
    ensurePass(input: {
      knowledgeBaseId: string
      documentId: string
      chapterId: null
      passType: 'book'
      passKey: string
      chapterHash: string
    }): Promise<{ action: 'run' | 'skip'; pass: { id: string } }>
    setRunning(id: string): Promise<void>
    setDone(id: string, stats: Record<string, number>, cost: Record<string, number>): Promise<void>
    setFailed(id: string, error: string): Promise<void>
    /** 审校修复：按文档列台账（定位成品单元行）+ 复位 pending（强制重跑） */
    listByDocument?(documentId: string): Promise<Array<{ id: string; passKey: string; status: string }>>
    resetToPending?(id: string): Promise<void>
  }
  artifacts: KbBrainArtifactRepository | null
}

export interface KbBookPassesDeps {
  llm?: BrainLlmFn
  /** 每库模型动态解析（handler 在 run 前注入 brainConfig.models.adjudicate） */
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  repos?: () => BookPassRepos | null
}

/** 画像 → 关卡清单（顺序即执行序；roster/chronicle/volume/coverage 为过程关） */
export function passesForProfile(contentType: string): Array<{ key: string; name: string }> {
  if (contentType === 'knowledge') {
    return [
      { key: 'roster', name: '术语名册' },
      { key: 'chronicle', name: '论证段' },
      { key: 'book:outline', name: '全书概要' },
      { key: 'book:knowledge-map', name: '知识体系图' },
      { key: 'review', name: '审校' },
      { key: 'coverage', name: '覆盖记账' },
    ]
  }
  if (contentType === 'history') {
    return [
      { key: 'roster', name: '名册' },
      { key: 'chronicle', name: '编年段' },
      { key: 'volume', name: '卷梗概' },
      { key: 'book:outline', name: '全书概要' },
      { key: 'book:character-roster', name: '人物册' },
      { key: 'review', name: '审校' },
      { key: 'coverage', name: '覆盖记账' },
    ]
  }
  if (contentType === 'novel') {
    return [
      { key: 'roster', name: '名册' },
      { key: 'chronicle', name: '编年段' },
      { key: 'volume', name: '卷梗概' },
      { key: 'book:outline', name: '全书概要' },
      { key: 'book:character-roster', name: '人物册' },
      { key: 'book:setting-index', name: '设定索引' },
      { key: 'book:foreshadow-ledger', name: '伏笔台账' },
      { key: 'style', name: '文风画像' },
      { key: 'review', name: '审校' },
      { key: 'coverage', name: '覆盖记账' },
    ]
  }
  return [
    { key: 'chronicle', name: '编年段' },
    { key: 'book:outline', name: '全书概要' },
    { key: 'coverage', name: '覆盖记账' },
  ]
}

/* ==================== 纯函数（测试友好） ==================== */

/** 均匀采样：超过 cap 时按等距步长抽 cap 条（保序列跨度，不截头） */
export function sampleEvenly<T>(items: T[], cap: number): T[] {
  if (items.length <= cap || cap <= 0) return items
  const out: T[] = []
  const step = items.length / cap
  for (let i = 0; i < cap; i++) out.push(items[Math.floor(i * step)]!)
  return out
}

/** 带卷归属的卡条目（漏斗中层规划的输入形态） */
export interface CardEntry extends CardWithChapter {
  chapterId: string
  title: string
  volume: string | null
}

/** 编年段（章→段第一级归并的规划） */
export interface ChronicleSegmentPlan {
  id: string
  volume: string | null
  entries: CardEntry[]
  estChars: number
}

/**
 * 编年段切分（纯函数）：连续章按证据预算分桶；不跨卷；knowledge 画像按目录层级
 * 聚主题（volume=篇/卷结构）；超预算/超章数封顶即切段。
 */
export function planChronicleSegments(
  entries: CardEntry[],
  opts?: { budgetChars?: number; perChapterChars?: number; maxChapters?: number }
): ChronicleSegmentPlan[] {
  const budget = opts?.budgetChars ?? BOOK_EVIDENCE_CHARS
  const perChapter = opts?.perChapterChars ?? CHARS_PER_CHAPTER_CARD
  const maxChapters = opts?.maxChapters ?? CHRONICLE_MAX_CHAPTERS
  const segments: ChronicleSegmentPlan[] = []
  let cur: CardEntry[] = []
  let chars = 0
  const flush = (): void => {
    if (cur.length === 0) return
    segments.push({
      id: `chronicle:${segments.length + 1}`,
      volume: cur[0]!.volume,
      entries: cur,
      estChars: chars,
    })
    cur = []
    chars = 0
  }
  for (const e of entries) {
    const volumeChanged = cur.length > 0 && cur[0]!.volume !== e.volume
    if (cur.length > 0 && (volumeChanged || cur.length >= maxChapters || chars + perChapter > budget)) flush()
    cur.push(e)
    chars += perChapter
  }
  flush()
  return segments
}

export interface EvidenceSection {
  title: string
  lines: string[]
}

/**
 * 证据包组装（纯函数）：按预算装填各节；装不下时节内均匀抽样并注明——
 * 「永不静默丢弃」（被抽样节由覆盖账本记录，总设计 §7 B7）。
 */
export function packSections(sections: EvidenceSection[], budgetChars = BOOK_EVIDENCE_CHARS): string {
  const kept: Array<{ title: string; lines: string[]; total: number }> = []
  let size = 0
  for (const s of sections) {
    const lines = s.lines.filter((l) => l.trim())
    if (lines.length === 0) continue
    const sectionCost = lines.reduce((acc, l) => acc + l.length + 1, 0) + s.title.length + 4
    if (size + sectionCost <= budgetChars) {
      kept.push({ title: s.title, lines, total: lines.length })
      size += sectionCost
      continue
    }
    const remaining = Math.max(2, Math.floor((budgetChars - size) / (PER_LINE_EST + s.title.length + 4)))
    if (remaining <= 0) break
    const sampled = sampleEvenly(lines, remaining)
    kept.push({ title: `${s.title}（已按 ${sampled.length}/${lines.length} 抽样）`, lines: sampled, total: lines.length })
    size += sampled.reduce((acc, l) => acc + l.length + 1, 0) + s.title.length + 12
    if (size >= budgetChars) break
  }
  return kept.map((k) => `【${k.title}】\n${k.lines.join('\n')}`).join('\n\n')
}
const PER_LINE_EST = 120

/** 卡 → 段梗概行（编年/卷/主线的取材形态） */
export function cardDigestLine(e: CardEntry, card: ReadingCard): string {
  const vol = e.volume ? `（${e.volume}）` : ''
  return `#第${e.chapterNo}章《${e.title}》${vol}：${card.summary.trim()}`
}

/* ---------- 伏笔线 ---------- */

export interface ForeshadowBeat {
  action: string
  ch: number
  note: string
}

export interface ForeshadowLine {
  label: string
  coreQuestion: string
  status: 'open' | 'partial' | 'resolved'
  beats: ForeshadowBeat[]
}

/** 卡内伏笔动作聚合（精确规范名分组） */
export function aggregateForeshadowActions(entries: Array<CardWithChapter>): Map<string, ForeshadowBeat[]> {
  const lines = new Map<string, ForeshadowBeat[]>()
  for (const { card, chapterNo } of entries) {
    if (card.profile !== 'novel') continue
    for (const f of card.foreshadow) {
      const key = f.label.replace(/\s+/g, '').trim() || f.label
      const list = lines.get(key) ?? []
      list.push({ action: f.action, ch: f.ch || chapterNo, note: f.t })
      lines.set(key, list)
    }
  }
  for (const beats of lines.values()) beats.sort((a, b) => a.ch - b.ch)
  return lines
}

/** 疑似同线候选簇（label 规范名互为包含或同前缀——供一次 LLM 校准） */
export function foreshadowCandidateClusters(labels: string[]): string[][] {
  const arr = [...labels].sort()
  const clusters: string[][] = []
  const used = new Set<string>()
  for (let i = 0; i < arr.length; i++) {
    if (used.has(arr[i]!)) continue
    const group = [arr[i]!]
    for (let j = i + 1; j < arr.length; j++) {
      if (used.has(arr[j]!)) continue
      const a = arr[i]!
      const b = arr[j]!
      if (a.includes(b) || b.includes(a) || a.slice(0, 4) === b.slice(0, 4)) {
        group.push(b)
        used.add(b)
      }
    }
    if (group.length > 1) clusters.push(group)
  }
  return clusters
}

/** 线状态推导：出现 reveal/payoff 即 resolved；出现 partial_reveal 即 partial；否则 open */
export function deriveForeshadowStatus(beats: ForeshadowBeat[]): 'open' | 'partial' | 'resolved' {
  if (beats.some((b) => b.action === 'reveal' || b.action === 'payoff')) return 'resolved'
  if (beats.some((b) => b.action === 'partial_reveal')) return 'partial'
  return 'open'
}

/** 覆盖账本（纯程序推导；缺口可见、可补跑） */
export interface CoverageReport {
  v: 1
  totals: {
    chapters: number
    narrative: number
    withCard: number
    inSegment: number
    inVolume: number
    namesTotal: number
    namesAssigned: number
  }
  gaps: Array<{ kind: string; detail: string }>
  sampling: string[]
}

export function computeCoverage(input: {
  totalChapters: number
  narrativeChapters: number
  cardChapterNos: Set<number>
  segmentChapters: Set<number>
  volumeChapters: Set<number>
  cardNames: Set<string>
  rosterNames: Set<string>
  sampling: string[]
}): CoverageReport {
  const gaps: CoverageReport['gaps'] = []
  const missingCard = [...input.cardChapterNos].length
  if (missingCard < input.narrativeChapters) {
    gaps.push({ kind: 'card-missing', detail: `${input.narrativeChapters - missingCard} 个叙事章缺卡` })
  }
  const unsegmented = input.cardChapterNos.size - input.segmentChapters.size
  if (unsegmented > 0) gaps.push({ kind: 'segment-uncovered', detail: `${unsegmented} 章未入编年段` })
  if (input.volumeChapters.size > 0 && input.segmentChapters.size - input.volumeChapters.size > 0) {
    gaps.push({ kind: 'volume-uncovered', detail: `${input.segmentChapters.size - input.volumeChapters.size} 章未入卷` })
  }
  let unassigned = 0
  for (const n of input.cardNames) {
    if (!input.rosterNames.has(n)) unassigned++
  }
  if (unassigned > 0) gaps.push({ kind: 'name-unassigned', detail: `${unassigned} 个名字未归属名册` })
  return {
    v: 1,
    totals: {
      chapters: input.totalChapters,
      narrative: input.narrativeChapters,
      withCard: input.cardChapterNos.size,
      inSegment: input.segmentChapters.size,
      inVolume: input.volumeChapters.size,
      namesTotal: input.cardNames.size,
      namesAssigned: input.cardNames.size - unassigned,
    },
    gaps,
    sampling: input.sampling,
  }
}

/* ==================== 服务 ==================== */

interface RunContext {
  kbId: string
  documentId: string
  docName: string
  contentType: string
  chapters: BookChapter[]
  entries: CardEntry[]
  fingerprint: string
  repos: BookPassRepos
  stats: Record<string, number>
}

export class KbBookPassesService {
  private readonly scoped: KbScopedLlm
  private readonly reposFn: () => BookPassRepos | null

  constructor(deps: KbBookPassesDeps = {}) {
    // 书级归并走裁决档位（归纳质量优先于速度）；模型解析按 kbId 隔离
    this.scoped = createKbScopedLlm('kb-brain-adjudicate', {
      injected: deps.llm,
      fallback: deps.modelOverride,
    })
    this.reposFn =
      deps.repos ??
      ((): BookPassRepos | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbNotes || !db.kbDocuments || !db.kbChapters || !db.kbDigestPasses || !db.kbBrainEntities) return null
        return {
          entities: db.kbBrainEntities,
          notes: db.kbNotes,
          docs: db.kbDocuments,
          chapters: db.kbChapters,
          passes: db.kbDigestPasses,
          artifacts: db.kbBrainArtifacts ?? null,
        }
      })
  }

  /** 注入每库模型解析（run 前按 kbId 调用；llm 为注入型时无效） */
  setModelOverride(kbId: string, fn: () => BrainModelRef): void {
    this.scoped.setOverride(kbId, fn)
  }

  private llmFor(kbId: string): BrainLlmFn {
    return this.scoped.llmFor(kbId)
  }

  /** 跑完该画像的全部书级关卡（单遍 fail-soft；缺关键仓储早退防烧钱） */
  async runForDocument(kbId: string, documentId: string, contentType: string): Promise<void> {
    const repos = this.reposFn()
    if (!repos || !repos.notes) return
    const chapters = (await repos.chapters.findByDocument(documentId, {
      includeContent: true,
      includeCard: true,
    })) as BookChapter[]
    if (chapters.length === 0) return
    const fingerprint = createHash('sha1')
      .update(
        chapters
          .map((c) => c.contentHash || c.id)
          .sort()
          .join('|') + `|${contentType}`
      )
      .digest('hex')
    const entries: CardEntry[] = []
    for (const c of chapters) {
      const card = parseCard(c.brainCard)
      if (card) entries.push({ card, chapterNo: c.ordering, chapterId: c.id, title: c.title, volume: c.parentTitle ?? null })
    }
    const docName = (await repos.docs.findById(documentId))?.name ?? '本书'
    for (const p of passesForProfile(contentType)) {
      const stats: Record<string, number> = { calls: 0 }
      const ctx: RunContext = { kbId, documentId, docName, contentType, chapters, entries, fingerprint, repos, stats }
      try {
        await this.runPass(p, ctx)
      } catch (e) {
        logger.warn(
          `[kb-brain] 书级遍失败 doc=${documentId} pass=${p.key}: ${e instanceof Error ? e.message : String(e)}`
        )
      }
    }
  }

  private async runPass(p: { key: string; name: string }, ctx: RunContext): Promise<void> {
    const { repos, kbId, documentId } = ctx
    const decision = await repos.passes.ensurePass({
      knowledgeBaseId: kbId,
      documentId,
      chapterId: null,
      passType: 'book',
      passKey: p.key,
      chapterHash: ctx.fingerprint,
    })
    if (decision.action === 'skip') return
    const pass = decision.pass
    await repos.passes.setRunning(pass.id)
    try {
      switch (p.key) {
        case 'roster':
          await this.passRoster(ctx)
          break
        case 'chronicle':
          await this.passChronicle(ctx)
          break
        case 'volume':
          await this.passVolume(ctx)
          break
        case 'book:outline':
          await this.passOutline(ctx)
          break
        case 'book:character-roster':
          await this.passCharacterRoster(ctx)
          break
        case 'book:setting-index':
          await this.passSettingIndex(ctx)
          break
        case 'book:foreshadow-ledger':
          await this.passForeshadow(ctx)
          break
        case 'style':
          await this.passStyle(ctx)
          break
        case 'book:knowledge-map':
          await this.passKnowledgeMap(ctx)
          break
        case 'review':
          await this.passReview(ctx)
          break
        case 'coverage':
          await this.passCoverage(ctx)
          break
        default:
          await repos.passes.setFailed(pass.id, `未知书级关卡 ${p.key}`)
          return
      }
      await repos.passes.setDone(pass.id, ctx.stats, { calls: ctx.stats.calls ?? 0, tokensIn: 0, tokensOut: 0 })
    } catch (e) {
      await repos.passes.setFailed(pass.id, e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  /* ---------- 名册 ---------- */

  private async passRoster(ctx: RunContext): Promise<void> {
    const { repos, kbId, documentId } = ctx
    if (!repos.artifacts || ctx.entries.length === 0) return // 旧库无工件表 / 无卡：跳过
    const roster = new KbRosterService({
      llm: this.llmFor(kbId),
      entities: repos.entities as KbEntityRepository,
    })
    const narrativeTotal = ctx.chapters.filter((c) => c.content?.trim()).length
    const { snapshot, entityMerges } = await roster.buildRoster(kbId, ctx.entries, narrativeTotal)
    let merged = 0
    for (const m of entityMerges) {
      try {
        await repos.entities.merge(m.fromId, m.toId)
        merged++
      } catch (e) {
        logger.warn(`[kb-brain] 名册实体合并失败（跳过）: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    // 人审保持：旧快照已 confirmed（名册卡被接受过）→ 沿用旧 tier，仅更新统计
    const prev = await repos.artifacts.findByKey(documentId, 'roster')
    if (prev) {
      try {
        const old = JSON.parse(prev.body ?? '{}') as RosterSnapshot
        if (old?.status === 'confirmed') {
          const tierByEntity = new Map<string, { tier: RosterEntry['tier']; reason: string }>()
          for (const e of [...(old.characters ?? []), ...(old.terms ?? [])]) {
            if (e.entityId) tierByEntity.set(e.entityId, { tier: e.tier, reason: `${e.tierReason}（人审确认，保留）` })
          }
          for (const e of [...snapshot.characters, ...snapshot.terms]) {
            const kept = e.entityId ? tierByEntity.get(e.entityId) : undefined
            if (kept) {
              e.tier = kept.tier
              e.tierReason = kept.reason
            }
          }
          snapshot.status = 'confirmed'
        }
      } catch {
        // 旧快照损坏：按新快照走
      }
    }
    await repos.artifacts.upsert(kbId, {
      documentId,
      artifactKey: 'roster',
      contentHash: ctx.fingerprint,
      body: JSON.stringify(snapshot),
    })
    ctx.stats.merged = merged
    ctx.stats.characters = snapshot.characters.length
    ctx.stats.terms = snapshot.terms.length
    await this.proposeCard(
      ctx,
      {
        type: 'roster',
        title: `《${ctx.docName}》名册`,
        description:
          '本书人物与设定术语的归并名册与重要性分级。接受=采纳当前分级（后续人物档案/设定档案按此建档）；结构修正请到实体管理界面操作后重跑名册。',
        body: renderRosterMarkdown(snapshot),
      },
      ctx.stats
    )
    ctx.stats.calls += snapshot.totalItems > 0 ? Math.ceil(snapshot.totalItems / 40) : 0
  }

  /* ---------- 编年段 ---------- */

  private async passChronicle(ctx: RunContext): Promise<void> {
    const { repos, kbId, documentId } = ctx
    if (!repos.artifacts || ctx.entries.length === 0) return
    const segments = planChronicleSegments(ctx.entries)
    let done = 0
    for (const seg of segments) {
      const artifactKey = seg.id
      const existing = await repos.artifacts.findByKey(documentId, artifactKey)
      if (existing?.contentHash === ctx.fingerprint) continue // 幂等：段级跳过
      const digest = seg.entries.map((e) => {
        const card = e.card
        return cardDigestLine(e, card)
      })
      const range = `第 ${seg.entries[0]!.chapterNo}–${seg.entries[seg.entries.length - 1]!.chapterNo} 章`
      const raw = await this.llmFor(kbId)({
        system: CHRONICLE_SYSTEM,
        user: buildChronicleUser(seg.id, range, packSections([{ title: '章卡', lines: digest }])),
        maxTokens: BRAIN_LLM_MAX_TOKENS,
      })
      ctx.stats.calls += 1
      const parsed = extractJsonFromResponse(raw) as { summary?: string; points?: unknown[] } | null
      if (!parsed?.summary) throw new Error(`编年段 ${seg.id} 无 summary`)
      await repos.artifacts.upsert(kbId, {
        documentId,
        artifactKey,
        contentHash: ctx.fingerprint,
        body: JSON.stringify({ ...parsed, volume: seg.volume, chapters: [seg.entries[0]!.chapterNo, seg.entries[seg.entries.length - 1]!.chapterNo] }),
      })
      done++
    }
    ctx.stats.segments = done
  }

  /* ---------- 卷 ---------- */

  private async passVolume(ctx: RunContext): Promise<void> {
    const { repos, kbId, documentId } = ctx
    if (!repos.artifacts) return
    const artifacts = await repos.artifacts.findByDocument(documentId)
    const segArtifacts = artifacts.filter((a) => a.artifactKey.startsWith('chronicle:'))
    if (segArtifacts.length === 0) return
    const byVolume = new Map<string, Array<{ key: string; body: string }>>()
    for (const a of segArtifacts) {
      try {
        const data = JSON.parse(a.body ?? '{}') as { volume?: string | null }
        const vol = data.volume ?? null
        if (!vol) continue
        const list = byVolume.get(vol) ?? []
        list.push({ key: a.artifactKey, body: a.body ?? '' })
        byVolume.set(vol, list)
      } catch {
        continue
      }
    }
    let done = 0
    for (const [vol, segs] of byVolume) {
      const artifactKey = `volume:${vol}`
      const existing = await repos.artifacts.findByKey(documentId, artifactKey)
      if (existing?.contentHash === ctx.fingerprint) continue
      const digest = segs
        .map((s) => {
          try {
            const d = JSON.parse(s.body) as { summary?: string; points?: Array<{ title?: string; startCh?: number; endCh?: number }> }
            const pts = (d.points ?? []).map((p) => `- ${p.title ?? ''}（${p.startCh ?? '?'}–${p.endCh ?? '?'}章）`).join('\n')
            return `${s.key}：${d.summary ?? ''}${pts ? `\n剧情点：\n${pts}` : ''}`
          } catch {
            return `${s.key}：（损坏）`
          }
        })
        .join('\n\n')
      const raw = await this.llmFor(kbId)({
        system: VOLUME_SYSTEM,
        user: buildVolumeUser(vol, packSections([{ title: '编年段', lines: digest.split('\n') }])),
        maxTokens: BRAIN_LLM_MAX_TOKENS,
      })
      ctx.stats.calls += 1
      const parsed = extractJsonFromResponse(raw) as { summary?: string; turns?: string[] } | null
      if (!parsed?.summary) throw new Error(`卷 ${vol} 无 summary`)
      await repos.artifacts.upsert(kbId, {
        documentId,
        artifactKey,
        contentHash: ctx.fingerprint,
        body: JSON.stringify(parsed),
      })
      done++
    }
    ctx.stats.volumes = done
  }

  /* ---------- 全书主线（多级归并：卷/段 → 书） ---------- */

  private async passOutline(ctx: RunContext): Promise<void> {
    const { repos, kbId } = ctx
    let materialLines: string[] = []
    if (repos.artifacts) {
      const artifacts = await repos.artifacts.findByDocument(ctx.documentId)
      const volumes = artifacts.filter((a) => a.artifactKey.startsWith('volume:'))
      const segments = artifacts.filter((a) => a.artifactKey.startsWith('chronicle:'))
      if (volumes.length > 0) {
        materialLines = volumes.map((v) => {
          try {
            const d = JSON.parse(v.body ?? '{}') as { summary?: string; turns?: string[] }
            return `${v.artifactKey.replace('volume:', '卷『')}』：${d.summary ?? ''}${(d.turns ?? []).map((t) => `\n  转折：${t}`).join('')}`
          } catch {
            return `${v.artifactKey}：（损坏）`
          }
        })
      } else if (segments.length > 0) {
        materialLines = segments.map((s) => {
          try {
            const d = JSON.parse(s.body ?? '{}') as { summary?: string }
            return `${s.artifactKey}：${d.summary ?? ''}`
          } catch {
            return `${s.artifactKey}：（损坏）`
          }
        })
      }
    }
    if (materialLines.length === 0) {
      // 无中间层（旧库无工件表/无卡）——降级章卡/摘要（v1 行为，预算配额）
      materialLines = ctx.chapters
        .filter((c) => (c.content ?? '').trim())
        .map((c) => {
          const card = parseCard(c.brainCard)
          const head = card ? card.summary : (c.summary ?? '').trim().slice(0, 600) || (c.content ?? '').trim().slice(0, 200)
          return head ? `《${c.title}》${head}` : ''
        })
        .filter(Boolean)
    }
    if (materialLines.length === 0) return
    const body = await this.llmFor(kbId)({
      system: BOOK_OUTLINE_REDUCE_SYSTEM,
      user: packSections([{ title: '书级中间层', lines: materialLines }]),
      maxTokens: BRAIN_LLM_MAX_TOKENS,
    })
    ctx.stats.calls += 1
    await this.proposeCard(
      ctx,
      {
        type: 'book-outline',
        title: `《${ctx.docName}》全书概要`,
        description:
          '回答「这本书整体讲什么/主线是什么/怎么分卷分段」时使用：全书主线梗概、结构骨架与核心主题（多级归并产物，可追溯到卷/段）。',
        body,
      },
      ctx.stats
    )
  }

  /* ---------- 人物：群像卡 + 逐人档案卡 ---------- */

  private async passCharacterRoster(ctx: RunContext): Promise<void> {
    const { repos, kbId } = ctx
    if (!repos.artifacts) return
    const rosterArtifact = await repos.artifacts.findByKey(ctx.documentId, 'roster')
    if (!rosterArtifact) return
    let snapshot: RosterSnapshot
    try {
      snapshot = JSON.parse(rosterArtifact.body ?? '{}') as RosterSnapshot
    } catch {
      return
    }
    const characters = (snapshot.characters ?? []).filter((c) => c.tier !== 'passerby')
    const majors = characters.filter((c) => c.tier === 'protagonist' || c.tier === 'major')
    const minors = characters.filter((c) => c.tier === 'minor')

    // 主角/主要配角：逐人档案卡（证据=卡内事实按卷分组；多卷人物按卷小传段拼接）
    ctx.stats.dossiers = 0
    for (const [i, m] of majors.slice(0, DOSSIER_CAP).entries()) {
      const passKey = `character:${m.entityId ?? m.name}`
      const decision = await repos.passes.ensurePass({
        knowledgeBaseId: ctx.kbId,
        documentId: ctx.documentId,
        chapterId: null,
        passType: 'book',
        passKey,
        chapterHash: ctx.fingerprint,
      })
      if (decision.action === 'skip') continue
      await repos.passes.setRunning(decision.pass.id)
      try {
        const facts = this.characterFactsDigest(ctx, m)
        if (!facts) {
          await repos.passes.setDone(decision.pass.id, { skip: 1 }, { calls: 0, tokensIn: 0, tokensOut: 0 })
          continue
        }
        const raw = await this.llmFor(kbId)({
          system: CHARACTER_DOSSIER_SYSTEM,
          user: buildCharacterDossierUser(m.name, facts),
          maxTokens: BRAIN_LLM_MAX_TOKENS,
        })
        ctx.stats.calls += 1
        const parsed = extractJsonFromResponse(raw) as Record<string, string> | null
        if (!parsed?.coreProfile) throw new Error(`人物档案 ${m.name} 无 coreProfile`)
        const body = [
          `## 一句话简介`,
          parsed.summary ?? '',
          `## 核心档案`,
          parsed.coreProfile,
          `## 关系`,
          parsed.relationships ?? '（无卡内证据）',
          `## 最新状态`,
          parsed.latestState ?? '（无卡内证据）',
          `## 经历时间线`,
          parsed.timeline ?? '（无卡内证据）',
        ].join('\n\n')
        await this.proposeCard(
          ctx,
          {
            type: 'character-dossier',
            title: `《${ctx.docName}》人物档案：${m.name}`,
            description: `${m.name}（${m.tier === 'protagonist' ? '主角' : '主要配角'}，出现 ${m.mentionChapters} 章）的结构化档案：核心特征/关系/最新状态/经历时间线，全部带章号证据。`,
            body,
          },
          ctx.stats
        )
        ctx.stats.dossiers += 1
        await repos.passes.setDone(decision.pass.id, { dossier: 1 }, { calls: 1, tokensIn: 0, tokensOut: 0 })
      } catch (e) {
        await repos.passes.setFailed(decision.pass.id, e instanceof Error ? e.message : String(e))
        logger.warn(`[kb-brain] 人物档案失败 ${m.name}（跳过）: ${e instanceof Error ? e.message : String(e)}`)
      }
      void i
    }

    // 次要配角群像卡（每组 ≤10 人）；路人只列数
    if (minors.length > 0) {
      const sections: string[] = []
      for (let g = 0; g < Math.min(minors.length, DOSSIER_CAP * MINOR_GROUP_SIZE); g += MINOR_GROUP_SIZE) {
        const group = minors.slice(g, g + MINOR_GROUP_SIZE)
        const lines = group.map((m) => {
          const facts = this.characterFacts(ctx, m).slice(0, 3)
          return [`## ${m.name}（出现 ${m.mentionChapters} 章）`, m.sampleFacts.join('；'), ...facts.map((f) => `- ${f}`)].join('\n')
        })
        sections.push(lines.join('\n'))
      }
      if (sections.length > 0) {
        const body = await this.llmFor(kbId)({
          system: BOOK_ROSTER_SYSTEM,
          user: packSections([{ title: '次要人物', lines: sections }]),
          maxTokens: BRAIN_LLM_MAX_TOKENS,
        })
        ctx.stats.calls += 1
        await this.proposeCard(
          ctx,
          {
            type: 'character-roster',
            title: `《${ctx.docName}》人物册（次要配角群像）`,
            description: `次要配角 ${minors.length} 人的群像（每人定位与代表事实）；主角与主要配角见各自的人物档案卡；路人 ${snapshot.characters.length - characters.length} 人不建档。`,
            body,
          },
          ctx.stats
        )
      }
    }
  }

  /** 人物卡内事实（原始行） */
  private characterFacts(ctx: RunContext, m: RosterEntry): string[] {
    const names = new Set([m.name, ...m.aliases].map((n) => n.replace(/\s+/g, '')))
    const out: string[] = []
    for (const e of ctx.entries) {
      if (e.card.profile !== 'novel' && e.card.profile !== 'history') continue
      for (const c of e.card.characters) {
        if (!names.has(c.name.replace(/\s+/g, ''))) continue
        for (const f of c.facts) out.push(`第${f.ch}章：${f.t}`)
        if (c.endState) out.push(`第${e.chapterNo}章末：${c.endState}`)
      }
    }
    return out
  }

  /** 人物证据包（多卷按卷分节；预算内装填） */
  private characterFactsDigest(ctx: RunContext, m: RosterEntry): string {
    const facts = this.characterFacts(ctx, m)
    if (facts.length === 0) return ''
    const byVolume = new Map<string, string[]>()
    const nameSet = new Set([m.name, ...m.aliases].map((n) => n.replace(/\s+/g, '')))
    for (const e of ctx.entries) {
      if (e.card.profile !== 'novel' && e.card.profile !== 'history') continue
      if (!e.card.characters.some((c) => nameSet.has(c.name.replace(/\s+/g, '')))) continue
      const vol = e.volume ?? '正文'
      const list = byVolume.get(vol) ?? []
      list.push(...this.characterFacts({ ...ctx, entries: [e] }, m))
      byVolume.set(vol, list)
    }
    if (byVolume.size <= 1) {
      return packSections([{ title: '卡内事实', lines: facts.map((f) => `- ${f}`) }])
    }
    return packSections(
      [...byVolume.entries()].map(([vol, lines]) => ({ title: `卷小传素材：${vol}`, lines: lines.map((f) => `- ${f}`) }))
    )
  }

  /* ---------- 设定：索引卡 + 逐类别档案卡 ---------- */

  private async passSettingIndex(ctx: RunContext): Promise<void> {
    const { repos, kbId } = ctx
    if (!repos.artifacts) return
    const rosterArtifact = await repos.artifacts.findByKey(ctx.documentId, 'roster')
    if (!rosterArtifact) return
    let snapshot: RosterSnapshot
    try {
      snapshot = JSON.parse(rosterArtifact.body ?? '{}') as RosterSnapshot
    } catch {
      return
    }
    const terms = snapshot.terms ?? []
    if (terms.length === 0) return
    const byCategory = new Map<string, RosterEntry[]>()
    for (const t of terms) {
      const cat = t.category || '其他'
      const list = byCategory.get(cat) ?? []
      list.push(t)
      byCategory.set(cat, list)
    }

    // 索引卡：类别清单 + 一句话概览
    const indexLines = [...byCategory.entries()].map(([cat, list]) => `${cat}（${list.length} 条）：${list.slice(0, 8).map((t) => t.name).join('、')}${list.length > 8 ? ' …' : ''}`)
    const indexBody = await this.llmFor(kbId)({
      system: BOOK_SETTING_INDEX_SYSTEM,
      user: packSections([{ title: '设定类别清单', lines: indexLines }]),
      maxTokens: BRAIN_LLM_MAX_TOKENS,
    })
    ctx.stats.calls += 1
    await this.proposeCard(
      ctx,
      {
        type: 'setting-index',
        title: `《${ctx.docName}》设定索引`,
        description:
          '回答「这个世界如何运转/体系规则/势力地理」时使用：全书设定分类索引（逐类别的详细档案见各设定档案卡）。',
        body: indexBody,
      },
      ctx.stats
    )

    // 逐类别档案卡（证据=名册条目事实 + 卡内设定事实；无上限、预算配额）
    ctx.stats.worldDossiers = 0
    for (const [cat, list] of byCategory) {
      if (ctx.stats.worldDossiers >= WORLD_CATEGORY_CAP) break
      const passKey = `world:${cat}`
      const decision = await repos.passes.ensurePass({
        knowledgeBaseId: ctx.kbId,
        documentId: ctx.documentId,
        chapterId: null,
        passType: 'book',
        passKey,
        chapterHash: ctx.fingerprint,
      })
      if (decision.action === 'skip') continue
      await repos.passes.setRunning(decision.pass.id)
      try {
        const digest = this.worldFactsDigest(ctx, cat, list)
        if (!digest) {
          await repos.passes.setDone(decision.pass.id, { skip: 1 }, { calls: 0, tokensIn: 0, tokensOut: 0 })
          continue
        }
        const raw = await this.llmFor(kbId)({
          system: WORLD_DOSSIER_SYSTEM,
          user: buildWorldDossierUser(cat, digest),
          maxTokens: BRAIN_LLM_MAX_TOKENS,
        })
        ctx.stats.calls += 1
        const parsed = extractJsonFromResponse(raw) as { overview?: string; items?: Array<{ title?: string; content?: string }> } | null
        if (!parsed?.overview) throw new Error(`设定档案 ${cat} 无 overview`)
        const body = [parsed.overview, '', ...(parsed.items ?? []).map((it) => `## ${it.title ?? '未命名'}\n${it.content ?? ''}`)].join('\n')
        await this.proposeCard(
          ctx,
          {
            type: 'setting-dossier',
            title: `《${ctx.docName}》设定档案：${cat}`,
            description: `${cat}类设定的完整档案：类别概览与逐条目内容（境界/等级类按层级排序，冲突说法并列带章号）。`,
            body,
          },
          ctx.stats
        )
        ctx.stats.worldDossiers += 1
        await repos.passes.setDone(decision.pass.id, { dossier: 1 }, { calls: 1, tokensIn: 0, tokensOut: 0 })
      } catch (e) {
        await repos.passes.setFailed(decision.pass.id, e instanceof Error ? e.message : String(e))
        logger.warn(`[kb-brain] 设定档案失败 ${cat}（跳过）: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  /** 类别证据包（名册条目事实 + 卡内 world 事实） */
  private worldFactsDigest(ctx: RunContext, cat: string, terms: RosterEntry[]): string {
    const nameSet = new Set<string>()
    for (const t of terms) {
      nameSet.add(t.name.replace(/\s+/g, ''))
      for (const a of t.aliases) nameSet.add(a.replace(/\s+/g, ''))
    }
    const lines: string[] = terms.map((t) => `${t.name}${t.aliases.length ? `（${t.aliases.join('、')}）` : ''}：${t.sampleFacts.join('；') || '（无摘要）'}`)
    for (const e of ctx.entries) {
      if (e.card.profile !== 'novel' && e.card.profile !== 'history') continue
      for (const w of e.card.world) {
        const catHit = ctx.contentType === 'novel' ? true : true
        void catHit
        if (!nameSet.has(w.name.replace(/\s+/g, '')) && w.domain !== cat) continue
        for (const f of w.facts) lines.push(`第${f.ch}章《${w.name}》[${w.domain}]：${f.t}`)
      }
    }
    return packSections([{ title: `类别「${cat}」的证据`, lines: lines.map((l) => `- ${l}`) }])
  }

  /* ---------- 伏笔线 ---------- */

  private async passForeshadow(ctx: RunContext): Promise<void> {
    const aggregated = aggregateForeshadowActions(ctx.entries)
    if (aggregated.size === 0) return // 宁缺勿滥：无登记不成卡
    // 疑似同线簇一次校准（拿不准不并；校准失败保持程序分组）
    const candidates = foreshadowCandidateClusters([...aggregated.keys()])
    if (candidates.length > 0) {
      try {
        const raw = await this.llmFor(ctx.kbId)({
          system: FORESHADOW_LINES_SYSTEM,
          user: `【候选簇】\n${candidates
            .map((g, i) => `簇${i + 1}：\n${g.map((label) => `- ${label}：${(aggregated.get(label) ?? []).map((b) => `${b.action}@第${b.ch}章`).join('；')}`).join('\n')}`)
            .join('\n\n')}\n\n请输出合并决定 JSON。`,
          maxTokens: 4000,
        })
        ctx.stats.calls += 1
        const parsed = extractJsonFromResponse(raw) as { groups?: Array<{ label?: string }> } | null
        for (const g of parsed?.groups ?? []) {
          if (!g.label) continue
          const cluster = candidates.find((c) => c.includes(g.label!))
          if (!cluster) continue
          for (const label of cluster) {
            if (label === g.label) continue
            const beats = aggregated.get(label)
            if (beats) {
              aggregated.get(g.label)?.push(...beats)
              aggregated.delete(label)
            }
          }
        }
        for (const beats of aggregated.values()) beats.sort((a, b) => a.ch - b.ch)
      } catch {
        // 保持程序分组
      }
    }
    const lines: ForeshadowLine[] = [...aggregated.entries()]
      .slice(0, FORESHADOW_LINE_CAP)
      .map(([label, beats]) => ({
        label,
        coreQuestion: beats[0]?.note ?? '',
        status: deriveForeshadowStatus(beats),
        beats,
      }))
    const body = [
      `共 ${lines.length} 条伏笔线（open=${lines.filter((l) => l.status === 'open').length} / partial=${lines.filter((l) => l.status === 'partial').length} / resolved=${lines.filter((l) => l.status === 'resolved').length}）。`,
      '',
      ...lines.map((l) => {
        const beats = l.beats.map((b) => `  - 第${b.ch}章 [${b.action}] ${b.note}`).join('\n')
        return `## ${l.label}（${l.status === 'resolved' ? '已回收' : l.status === 'partial' ? '部分揭示' : '未回收'}）\n${beats}`
      }),
    ].join('\n')
    await this.proposeCard(
      ctx,
      {
        type: 'foreshadow-ledger',
        title: `《${ctx.docName}》伏笔台账`,
        description:
          '检查伏笔回收、规划后文呼应或写同类作品的悬念管理时使用：全书伏笔线登记表——每条线带六类动作节拍链（埋设/强化/误导/部分揭示/揭示/回收，各挂章号）与回收状态。',
        body: body.slice(0, CARD_BODY_MAX),
      },
      ctx.stats
    )
  }

  /* ---------- 文风画像（novel） ---------- */

  private async passStyle(ctx: RunContext): Promise<void> {
    const notes: string[] = []
    for (const e of ctx.entries) {
      if (e.card.profile !== 'novel') continue
      for (const s of e.card.style) notes.push(`第${e.chapterNo}章：${s.t}${s.why ? `（${s.why}）` : ''}`)
    }
    // 确定性抽样：首章/中点/末章（正文截段）
    const narrative = ctx.chapters.filter((c) => (c.content ?? '').trim())
    const excerpts: string[] = []
    for (const idx of [0, Math.floor(narrative.length / 2), narrative.length - 1]) {
      const c = narrative[idx]
      if (!c) continue
      excerpts.push(`第${c.ordering}章《${c.title}》：${(c.content ?? '').trim().slice(0, STYLE_EXCERPT_CHARS)}`)
    }
    if (notes.length === 0 && excerpts.length === 0) return
    const body = await this.llmFor(ctx.kbId)({
      system: STYLE_PROFILE_SYSTEM,
      user: buildStyleProfileUser(
        packSections([{ title: '文风观察', lines: notes.map((n) => `- ${n}`) }]),
        packSections([{ title: '抽样原文', lines: excerpts.map((e) => `- ${e}`) }])
      ),
      maxTokens: BRAIN_LLM_MAX_TOKENS,
    })
    ctx.stats.calls += 1
    await this.proposeCard(
      ctx,
      {
        type: 'style-profile',
        title: `《${ctx.docName}》文风画像`,
        description: '写同类作品对齐文风或学习本书笔法时使用：叙事视角/句式/节奏/对白/章末手法的画像与可迁移写法，附抽样原文佐证。',
        body,
      },
      ctx.stats
    )
  }

  /* ---------- 知识体系图（knowledge） ---------- */

  private async passKnowledgeMap(ctx: RunContext): Promise<void> {
    if (ctx.contentType !== 'knowledge') return
    const claimLines: string[] = []
    const conceptLines: string[] = []
    for (const e of ctx.entries) {
      if (e.card.profile !== 'knowledge') continue
      for (const c of e.card.claims) claimLines.push(`第${c.ch}章：${c.t}`)
      for (const c of e.card.concepts) conceptLines.push(`「${c.term}」（第${c.ch}章）：${c.definition}`)
    }
    if (claimLines.length === 0) return
    const sections: EvidenceSection[] = [
      { title: '论点链', lines: claimLines.map((l) => `- ${l}`) },
      { title: '概念定义', lines: conceptLines.map((l) => `- ${l}`) },
    ]
    const body = await this.llmFor(ctx.kbId)({
      system: BOOK_KNOWLEDGE_MAP_SYSTEM,
      user: packSections(sections),
      maxTokens: BRAIN_LLM_MAX_TOKENS,
    })
    ctx.stats.calls += 1
    await this.proposeCard(
      ctx,
      {
        type: 'knowledge-map',
        title: `《${ctx.docName}》知识体系图`,
        description: '快速把握这本书的知识框架、检索概念定义或规划学习路径时使用（论点链与概念树取材自章卡，无数量上限）。',
        body,
      },
      ctx.stats
    )
  }

  /* ---------- 审校修复回路（V4-4；一轮修复不递归） ---------- */

  /** 画像 → 审校领域 */
  private domainsForProfile(contentType: string): string[] {
    if (contentType === 'knowledge') return ['概念', '论证']
    if (contentType === 'history') return ['人物', '时序']
    return ['人物', '设定', '剧情', '伏笔']
  }

  private async passReview(ctx: RunContext): Promise<void> {
    for (const domain of this.domainsForProfile(ctx.contentType)) {
      await this.reviewDomain(ctx, domain, ctx.fingerprint)
    }
  }

  /** 领域审校：材料组装 → LLM 交叉核对 → 问题落工件 → 修复重跑（≤3 个受影响单元自动修） */
  private async reviewDomain(ctx: RunContext, domain: string, hash: string): Promise<void> {
    const { repos, documentId } = ctx
    if (!repos.artifacts) return
    const material = await this.reviewMaterial(ctx, domain)
    if (!material) return
    const raw = await this.llmFor(ctx.kbId)({
      system: BOOK_REVIEW_SYSTEM,
      user: buildBookReviewUser(domain, material),
      maxTokens: 4000,
    })
    ctx.stats.calls += 1
    const issues = parseReviewIssues(extractJsonFromResponse(raw), { max: 50 })
    await repos.artifacts.upsert(ctx.kbId, {
      documentId,
      artifactKey: `review:${domain}`,
      contentHash: hash,
      body: JSON.stringify({ domain, issues, reviewedAt: new Date().toISOString() }),
    })
    ctx.stats[`issues:${domain}`] = issues.length
    // 修复：unitKey 即成品遍 passKey（character:*/world:*/book:outline）；≤3 个单元自动修
    const unitKeys = [...new Set(issues.map((i) => i.unitKey))].filter((k) => this.isRepairableUnitKey(k))
    if (unitKeys.length === 0 || unitKeys.length > 3) return
    for (const unitKey of unitKeys) {
      await this.repairUnit(ctx, unitKey, issues.filter((i) => i.unitKey === unitKey))
    }
  }

  private isRepairableUnitKey(unitKey: string): boolean {
    return unitKey === 'book:outline' || unitKey.startsWith('character:') || unitKey.startsWith('world:')
  }

  /** 修复 = 成品遍台账复位 pending（指纹拼入审校意见防 skip）→ 重跑该成品遍（其余单元 done 自动跳过） */
  private async repairUnit(ctx: RunContext, unitKey: string, issues: ReviewIssue[]): Promise<void> {
    const { repos } = ctx
    if (!repos.passes.listByDocument || !repos.passes.resetToPending) return
    const rows = await repos.passes.listByDocument(ctx.documentId)
    const row = rows.find((r) => r.passKey === unitKey)
    if (!row) return
    // 台账语义：resetToPending 后 ensurePass 对 pending 放行；passKey 拼入问题指纹，
    // 使「同输入重跑」与「审校触发重跑」可区分（指纹变化→放行）
    await repos.passes.resetToPending(row.id)
    const repairedCtx: RunContext = { ...ctx, fingerprint: `${ctx.fingerprint}|fix:${issues.length}:${issues[0]?.chapterOrders.join(',') ?? ''}` }
    if (unitKey === 'book:outline') await this.passOutline(repairedCtx)
    else if (unitKey.startsWith('character:')) await this.passCharacterRoster(repairedCtx)
    else if (unitKey.startsWith('world:')) await this.passSettingIndex(repairedCtx)
    logger.info(`[kb-brain] 审校修复重跑: doc=${ctx.documentId} unit=${unitKey} issues=${issues.length}`)
  }

  /** 审校材料组装（工件优先；成品卡经 notes.listByStatus 取摘要） */
  private async reviewMaterial(ctx: RunContext, domain: string): Promise<string> {
    const { repos } = ctx
    const sections: EvidenceSection[] = []
    const wantTypes: string[] =
      domain === '人物'
        ? ['character-dossier', 'character-roster']
        : domain === '设定'
          ? ['setting-dossier', 'setting-index']
          : domain === '剧情'
            ? ['book-outline']
            : domain === '伏笔'
              ? ['foreshadow-ledger']
              : domain === '概念' || domain === '论证'
                ? ['knowledge-map', 'book-outline']
                : ['book-outline']
    if (repos.notes.listByStatus) {
      for (const type of wantTypes) {
        try {
          const { rows } = await repos.notes.listByStatus(ctx.kbId, 'proposed', 1, 6, type)
          const pub = rows.length === 0 ? await repos.notes.listByStatus(ctx.kbId, 'published', 1, 6, type) : { rows }
          const lines = pub.rows.map((r) => `《${r.title ?? ''}》${(r.description ?? '').slice(0, 80)}｜${(r.body ?? '').slice(0, 500)}`)
          if (lines.length) sections.push({ title: `成品卡摘要（${type}）`, lines })
        } catch {
          continue
        }
      }
    }
    if (repos.artifacts) {
      const artifacts = await repos.artifacts.findByDocument(ctx.documentId)
      const rosterArtifact = artifacts.find((a) => a.artifactKey === 'roster')
      if (rosterArtifact && (domain === '人物' || domain === '设定')) {
        try {
          const snap = JSON.parse(rosterArtifact.body ?? '{}') as RosterSnapshot
          const list = domain === '人物' ? (snap.characters ?? []).slice(0, 15) : (snap.terms ?? []).slice(0, 15)
          sections.push({
            title: '名册摘要',
            lines: list.map((e) => `- ${e.name}（${e.tier}${e.category ? `/${e.category}` : ''}，${e.mentionChapters}章）：${e.sampleFacts.join('；').slice(0, 120)}`),
          })
        } catch {
          // 名册快照损坏：跳过该节
        }
      }
      const segLines: string[] = []
      for (const a of artifacts) {
        if (!a.artifactKey.startsWith('chronicle:')) continue
        try {
          const d = JSON.parse(a.body ?? '{}') as { summary?: string; chapters?: [number, number] }
          segLines.push(`${a.artifactKey}（${d.chapters?.[0]}–${d.chapters?.[1]}章）：${d.summary ?? ''}`)
        } catch {
          continue
        }
      }
      if (segLines.length && (domain === '剧情' || domain === '时序' || domain === '论证')) {
        sections.push({ title: '编年段摘要', lines: segLines })
      }
    }
    // 抽 3 章卡供交叉核对（首/中/尾）
    const sampleEntries = [ctx.entries[0], ctx.entries[Math.floor(ctx.entries.length / 2)], ctx.entries[ctx.entries.length - 1]].filter(
      (e): e is CardEntry => Boolean(e)
    )
    if (sampleEntries.length > 0) {
      sections.push({
        title: '章卡抽查',
        lines: sampleEntries.map((e) => `#第${e.chapterNo}章《${e.title}》：${e.card.summary.slice(0, 300)}`),
      })
    }
    if (sections.length === 0) return ''
    return packSections(sections)
  }

  /**
   * 库级审校补跑（自动化 24h 冷却入口）：对已消化文档逐个跑审校域遍。
   * 台账指纹带 24h 时间桶——同日重跑幂等跳过，跨日自动复审。
   */
  async runReviews(
    kbId: string,
    contentType: string,
    documentIds: string[]
  ): Promise<{ docs: number; issues: number }> {
    if (this.runningKb.has(kbId)) throw new Error('书级汇总进行中，请稍候')
    const repos = this.reposFn()
    if (!repos || !repos.notes) return { docs: 0, issues: 0 }
    this.runningKb.add(kbId)
    const progress: BookPassesProgress = { running: true, totalDocs: documentIds.length, processedDocs: 0 }
    this.kbProgress.set(kbId, progress)
    let totalIssues = 0
    let docsDone = 0
    try {
      const dayBucket = Math.floor(Date.now() / 86_400_000)
      for (const documentId of documentIds) {
        try {
          const chapters = (await repos.chapters.findByDocument(documentId, {
            includeContent: true,
            includeCard: true,
          })) as BookChapter[]
          if (chapters.length === 0) continue
          const fingerprint = createHash('sha1')
            .update(chapters.map((c) => c.contentHash || c.id).sort().join('|') + `|${contentType}`)
            .digest('hex')
          const entries: CardEntry[] = []
          for (const c of chapters) {
            const card = parseCard(c.brainCard)
            if (card) entries.push({ card, chapterNo: c.ordering, chapterId: c.id, title: c.title, volume: c.parentTitle ?? null })
          }
          const docName = (await repos.docs.findById(documentId))?.name ?? '本书'
          const stats: Record<string, number> = { calls: 0 }
          const ctx: RunContext = { kbId, documentId, docName, contentType, chapters, entries, fingerprint, repos, stats }
          for (const domain of this.domainsForProfile(contentType)) {
            const decision = await repos.passes.ensurePass({
              knowledgeBaseId: kbId,
              documentId,
              chapterId: null,
              passType: 'book',
              passKey: `review:${domain}`,
              chapterHash: `${fingerprint}|r${dayBucket}`,
            })
            if (decision.action === 'skip') continue
            await repos.passes.setRunning(decision.pass.id)
            try {
              await this.reviewDomain(ctx, domain, `${fingerprint}|r${dayBucket}`)
              await repos.passes.setDone(decision.pass.id, stats, { calls: stats.calls ?? 0, tokensIn: 0, tokensOut: 0 })
            } catch (e) {
              await repos.passes.setFailed(decision.pass.id, e instanceof Error ? e.message : String(e))
              logger.warn(`[kb-brain] 审校补跑失败 doc=${documentId} domain=${domain}: ${e instanceof Error ? e.message : String(e)}`)
            }
          }
          totalIssues += (stats['issues:人物'] ?? 0) + (stats['issues:设定'] ?? 0) + (stats['issues:剧情'] ?? 0) + (stats['issues:伏笔'] ?? 0) + (stats['issues:概念'] ?? 0) + (stats['issues:论证'] ?? 0) + (stats['issues:时序'] ?? 0)
          docsDone++
        } catch (e) {
          logger.warn(`[kb-brain] 审校补跑失败 doc=${documentId}: ${e instanceof Error ? e.message : String(e)}`)
        }
        progress.processedDocs += 1
      }
      return { docs: docsDone, issues: totalIssues }
    } finally {
      progress.running = false
      this.runningKb.delete(kbId)
    }
  }

  /* ---------- 覆盖记账（程序，零 LLM） ---------- */

  private async passCoverage(ctx: RunContext): Promise<void> {
    const { repos, documentId } = ctx
    const narrative = ctx.chapters.filter((c) => (c.content ?? '').trim() && c.brainCard)
    const cardChapterNos = new Set(ctx.entries.map((e) => e.chapterNo))
    const segmentChapters = new Set<number>()
    const volumeChapters = new Set<number>()
    const sampling: string[] = []
    if (repos.artifacts) {
      const artifacts = await repos.artifacts.findByDocument(documentId)
      for (const a of artifacts) {
        if (!a.artifactKey.startsWith('chronicle:')) continue
        try {
          const d = JSON.parse(a.body ?? '{}') as { chapters?: [number, number]; volume?: string | null }
          if (d.chapters) {
            for (let ch = d.chapters[0]; ch <= d.chapters[1]; ch++) {
              segmentChapters.add(ch)
              if (d.volume) volumeChapters.add(ch)
            }
          }
        } catch {
          continue
        }
      }
    } else {
      sampling.push('旧库无工件表：编年段/卷覆盖未记账')
    }
    const cardNames = new Set<string>()
    for (const e of ctx.entries) {
      const card = e.card as ReadingCard
      if (card.profile === 'novel' || card.profile === 'history') {
        for (const c of card.characters) cardNames.add(c.name.replace(/\s+/g, ''))
        for (const w of card.world) cardNames.add(w.name.replace(/\s+/g, ''))
      }
      if (card.profile === 'knowledge') for (const c of card.concepts) cardNames.add(c.term.replace(/\s+/g, ''))
    }
    const rosterNames = new Set<string>()
    if (repos.artifacts) {
      const rosterArtifact = await repos.artifacts.findByKey(documentId, 'roster')
      if (rosterArtifact) {
        try {
          const snap = JSON.parse(rosterArtifact.body ?? '{}') as RosterSnapshot
          for (const e of [...(snap.characters ?? []), ...(snap.terms ?? [])]) {
            rosterNames.add(e.name.replace(/\s+/g, ''))
            for (const a of e.aliases) rosterNames.add(a.replace(/\s+/g, ''))
          }
        } catch {
          sampling.push('名册快照损坏：名字归属未记账')
        }
      }
    }
    const report = computeCoverage({
      totalChapters: ctx.chapters.length,
      narrativeChapters: ctx.chapters.filter((c) => (c.content ?? '').trim()).length,
      cardChapterNos,
      segmentChapters,
      volumeChapters,
      cardNames,
      rosterNames,
      sampling,
    })
    void narrative
    if (repos.artifacts) {
      await repos.artifacts.upsert(ctx.kbId, {
        documentId,
        artifactKey: 'coverage',
        contentHash: ctx.fingerprint,
        body: JSON.stringify(report),
      })
    }
    ctx.stats.gaps = report.gaps.length
  }

  /* ---------- 卡片落库（同题语义沿用 v1） ---------- */

  /** 卡片落库：剥代码围栏、同题分状态处置、长度护栏。
   *  proposed 同题卡 → 更新 body（version+1，重汇总内容演进）；
   *  published/archived → skip（用户已处置的卡绝不覆盖）。 */
  private async proposeCard(
    ctx: RunContext,
    card: { type: string; title: string; description: string; body: string },
    stats: Record<string, number>
  ): Promise<void> {
    const clean = card.body
      .trim()
      .replace(/^```(?:markdown|md)?\s*\n?/, '')
      .replace(/\n?```\s*$/, '')
      .trim()
    if (clean.length < 30) return // 空泛/过短正文不成卡（宁缺勿滥）
    const repos = ctx.repos
    const similar = (await repos.notes.findSimilarTitle(ctx.kbId, card.title)) as Array<{
      id?: string
      title?: string
      status?: string
    }>
    const sameTitle = similar.find((s) => s.title === card.title)
    if (sameTitle) {
      if (
        sameTitle.status === 'proposed' &&
        typeof sameTitle.id === 'string' &&
        repos.notes.updateProposedBody
      ) {
        const updated = await repos.notes.updateProposedBody(sameTitle.id, {
          body: clean.slice(0, CARD_BODY_MAX),
          description: card.description.slice(0, 200),
        })
        if (updated) stats.updated = (stats.updated ?? 0) + 1
        return
      }
      stats.merged = (stats.merged ?? 0) + 1
      return
    }
    await repos.notes.propose(ctx.kbId, {
      title: card.title.slice(0, 120),
      description: card.description.slice(0, 200),
      body: clean.slice(0, CARD_BODY_MAX),
      type: card.type,
      evidence: JSON.stringify([{ documentId: ctx.documentId }]),
      origin: 'ai-distill',
    })
    stats.cards = (stats.cards ?? 0) + 1
  }

  /* ==================== 库级补跑（面板手动入口） ==================== */

  private readonly runningKb = new Set<string>()
  private readonly kbProgress = new Map<string, BookPassesProgress>()

  isRunningKb(kbId: string): boolean {
    return this.runningKb.has(kbId)
  }

  kbStatus(kbId: string): BookPassesProgress {
    return (
      this.kbProgress.get(kbId) ?? {
        running: false,
        totalDocs: 0,
        processedDocs: 0,
        lastError: undefined,
      }
    )
  }

  /**
   * 老库补跑入口：文档在漏斗上线前消化完成（brainStatus=digested）不会再发
   * completed 事件。本方法按库逐文档补跑（台账幂等：跑过的指纹直接 skip）。
   */
  async runForKnowledgeBase(
    kbId: string,
    contentType: string,
    documentIds: string[]
  ): Promise<BookPassesProgress> {
    if (this.runningKb.has(kbId)) throw new Error('书级汇总进行中，请稍候')
    const progress: BookPassesProgress = {
      running: true,
      totalDocs: documentIds.length,
      processedDocs: 0,
      lastError: undefined,
    }
    this.kbProgress.set(kbId, progress)
    this.runningKb.add(kbId)
    try {
      for (const documentId of documentIds) {
        try {
          await this.runForDocument(kbId, documentId, contentType)
        } catch (e) {
          progress.lastError = e instanceof Error ? e.message : String(e)
          logger.warn(`[kb-brain] 书级汇总补跑失败 doc=${documentId}: ${progress.lastError}`)
        }
        progress.processedDocs += 1
      }
      return progress
    } finally {
      progress.running = false
      this.runningKb.delete(kbId)
    }
  }
}

/** 书级汇总库级进度（面板轮询用） */
export interface BookPassesProgress {
  running: boolean
  totalDocs: number
  processedDocs: number
  lastError?: string
}

let singleton: KbBookPassesService | null = null

/** 面板手动补跑用单例（进度/单飞锁挂在实例上；消化链路自建实例不受影响） */
export function getKbBookPassesService(): KbBookPassesService {
  if (!singleton) singleton = new KbBookPassesService()
  return singleton
}
