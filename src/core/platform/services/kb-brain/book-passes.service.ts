/**
 * 知识大脑·书级汇总遍（book passes，§流程化提取）
 * @module platform/services/kb-brain/book-passes.service
 *
 * 章级基础遍只产出细节论断；整书级知识（全书概要、设定索引、人物册、伏笔台账、
 * 知识体系图）需要跨章汇总。本服务在文档消化收尾时按内容画像跑对应关卡清单：
 * - novel    → 全书概要 + 设定索引 + 人物册 + 伏笔台账
 * - knowledge → 知识体系图
 * - history  → 全书概要（时间线向） + 人物册
 * - other/'' → 仅全书概要
 * 幂等：每遍一行文档级台账（chapterId=null, passKey='book:<name>'），
 * chapterHash=章节集合指纹——任何一章内容变更即自动重汇总，未变则跳过。
 * 产物：proposed 经验卡（书级卡类型），走待审箱人审；正文直接 markdown（不走 JSON，
 * 书级汇总无需结构化字段，砍掉一类解析故障）。
 * 纪律：单遍失败不影响其他遍与消化主状态（fail-soft，台账留错）。
 */
import { createHash } from 'crypto'
import { createLogger } from '@core/utils/logger'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import {
  BOOK_OUTLINE_MAP_SYSTEM,
  BOOK_OUTLINE_REDUCE_SYSTEM,
  BOOK_SETTING_INDEX_SYSTEM,
  BOOK_ROSTER_SYSTEM,
  BOOK_FORESHADOW_SYSTEM,
  BOOK_KNOWLEDGE_MAP_SYSTEM
} from './prompts'
import {
  createKbScopedLlm,
  BRAIN_LLM_MAX_TOKENS,
  type BrainLlmFn,
  type BrainModelRef,
  type KbScopedLlm
} from './llm'

const logger = createLogger('KbBrainBookPasses')

/** 章纲 map 批大小（约 25 章梗概/调用，控单次输入体积） */
const OUTLINE_MAP_BATCH = 25
/** 全书概要取材章数上限（老库补跑入口面对数千章的大书——map 调用数 =
 *  上限/批大小；超出按均匀步长采样，保全书跨度而非只看开头） */
const OUTLINE_MAX_SEGS = 600
/** 设定索引/知识体系图取材论断上限 */
const MATERIAL_ATOM_CAP = 200
/** 人物册人物数与每人代表论断上限 */
const ROSTER_CHAR_CAP = 20
const ROSTER_ATOMS_PER_CHAR = 3
/** 伏笔台账登记上限 */
const FORESHADOW_CAP = 80
/** 卡正文长度护栏（嵌入与面板渲染友好） */
const CARD_BODY_MAX = 20000

export interface BookPassRepos {
  atoms: {
    findByKb(
      kbId: string,
      opts?: {
        status?: string[]
        type?: string
        layers?: string[]
        role?: string
        documentId?: string
        limit?: number
      }
    ): Promise<
      Array<{
        id: string
        statement: string
        layer: string
        subjectEntityId: string | null
        objectEntityId: string | null
      }>
    >
  }
  entities: {
    listActiveWithAliases(
      kbId: string,
      limit: number
    ): Promise<Array<{ id: string; name: string; entityType: string; summary: string | null }>>
  }
  notes: {
    findSimilarTitle(
      kbId: string,
      title: string
    ): Promise<Array<{ id?: string; title?: string; status?: string }>>
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
      opts?: { includeContent?: boolean },
    ): Promise<
      Array<{
        id: string
        title: string
        content: string | null
        summary: string | null
        contentHash: string | null
      }>
    >
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
  }
}

export interface KbBookPassesDeps {
  llm?: BrainLlmFn
  /** 每库模型动态解析（handler 在 run 前注入 brainConfig.models.adjudicate） */
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  repos?: () => BookPassRepos | null
}

/** 画像 → 关卡清单（顺序即执行序；概要始终第一） */
export function passesForProfile(contentType: string): Array<{ key: string; name: string }> {
  if (contentType === 'knowledge') return [{ key: 'book:knowledge-map', name: '知识体系图' }]
  if (contentType === 'history') {
    return [
      { key: 'book:outline', name: '全书概要' },
      { key: 'book:character-roster', name: '人物册' }
    ]
  }
  if (contentType === 'novel') {
    return [
      { key: 'book:outline', name: '全书概要' },
      { key: 'book:setting-index', name: '设定索引' },
      { key: 'book:character-roster', name: '人物册' },
      { key: 'book:foreshadow-ledger', name: '伏笔台账' }
    ]
  }
  return [{ key: 'book:outline', name: '全书概要' }]
}

export class KbBookPassesService {
  private readonly scoped: KbScopedLlm
  private readonly reposFn: () => BookPassRepos | null

  constructor(deps: KbBookPassesDeps = {}) {
    // 书级汇总走裁决档位（归纳质量优先于速度）
    // 模型解析按 kbId 隔离（review M7：单例并发跑多库不互踩）
    this.scoped = createKbScopedLlm('kb-brain-adjudicate', {
      injected: deps.llm,
      fallback: deps.modelOverride
    })
    this.reposFn =
      deps.repos ??
      ((): BookPassRepos | null => {
        const db = getCoreDatabaseManager()
        if (
          !db.kbAtoms ||
          !db.kbBrainEntities ||
          !db.kbNotes ||
          !db.kbDocuments ||
          !db.kbChapters ||
          !db.kbDigestPasses
        )
          return null
        return {
          atoms: db.kbAtoms,
          entities: db.kbBrainEntities,
          notes: db.kbNotes,
          docs: db.kbDocuments,
          chapters: db.kbChapters,
          passes: db.kbDigestPasses
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

  /** 跑完该画像的全部书级关卡（单遍 fail-soft；章节为空或仓储不齐直接返回——
   *  缺 notes 时若照跑，每遍都会在落卡处炸掉并烧掉一次 LLM 调用，重试耗尽前反复重试） */
  async runForDocument(kbId: string, documentId: string, contentType: string): Promise<void> {
    const repos = this.reposFn()
    if (!repos || !repos.notes) return
    // 书级汇总要消费章节正文（runPass 内 c.content）→ 显式 opt-in
    const chapters = await repos.chapters.findByDocument(documentId, { includeContent: true })
    if (chapters.length === 0) return
    // 章节集合指纹：任何一章 hash 变更（增删改）→ 指纹变 → 书级遍自动重汇总
    const fingerprint = createHash('sha1')
      .update(
        chapters
          .map(c => c.contentHash || c.id)
          .sort()
          .join('|')
      )
      .digest('hex')
    for (const p of passesForProfile(contentType)) {
      try {
        await this.runPass(p, { kbId, documentId, contentType, chapters, fingerprint, repos })
      } catch (e) {
        logger.warn(
          `[kb-brain] 书级遍失败 doc=${documentId} pass=${p.key}: ${e instanceof Error ? e.message : String(e)}`
        )
      }
    }
  }

  private async runPass(
    p: { key: string; name: string },
    ctx: {
      kbId: string
      documentId: string
      contentType: string
      chapters: Array<{
        id: string
        title: string
        content: string | null
        summary: string | null
        contentHash: string | null
      }>
      fingerprint: string
      repos: BookPassRepos
    }
  ): Promise<void> {
    const { repos, kbId, documentId } = ctx
    const decision = await repos.passes.ensurePass({
      knowledgeBaseId: kbId,
      documentId,
      chapterId: null,
      passType: 'book',
      passKey: p.key,
      chapterHash: ctx.fingerprint
    })
    if (decision.action === 'skip') return
    const pass = decision.pass
    await repos.passes.setRunning(pass.id)
    const stats: Record<string, number> = { cards: 0, merged: 0, updated: 0, calls: 0 }
    try {
      const docName = (await repos.docs.findById(documentId))?.name ?? '本书'
      switch (p.key) {
        case 'book:outline':
          await this.passOutline(ctx, docName, stats)
          break
        case 'book:setting-index':
          await this.passSettingIndex(ctx, docName, stats)
          break
        case 'book:character-roster':
          await this.passRoster(ctx, docName, stats)
          break
        case 'book:foreshadow-ledger':
          await this.passForeshadow(ctx, docName, stats)
          break
        case 'book:knowledge-map':
          await this.passKnowledgeMap(ctx, docName, stats)
          break
        default:
          // 未知关卡：台账不能留 running（会被 recover 反复重放）——按失败收口
          await repos.passes.setFailed(pass.id, `未知书级关卡 ${p.key}`)
          return
      }
      await repos.passes.setDone(pass.id, stats, { calls: stats.calls, tokensIn: 0, tokensOut: 0 })
    } catch (e) {
      await repos.passes.setFailed(pass.id, e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  /** 全书概要：章纲 map（>25 章分批；超大书均匀采样封顶）→ reduce 出卡 */
  private async passOutline(
    ctx: {
      chapters: Array<{ title: string; content: string | null; summary: string | null }>
      repos: BookPassRepos
      documentId: string
      kbId: string
    },
    docName: string,
    stats: Record<string, number>
  ): Promise<void> {
    const segs = ctx.chapters
      .map(c => {
        const summary = (c.summary ?? '').trim()
        const head = summary ? summary.slice(0, 600) : (c.content ?? '').trim().slice(0, 200)
        return head ? `《${c.title}》${head}` : ''
      })
      .filter(Boolean)
    if (segs.length === 0) return // 全空章：无材可汇总，零产出是合法终态
    const sampled = sampleEvenly(segs, OUTLINE_MAX_SEGS)
    let material: string
    if (sampled.length <= OUTLINE_MAP_BATCH) {
      material = sampled.join('\n')
    } else {
      const batchSynopses: string[] = []
      for (let i = 0; i < sampled.length; i += OUTLINE_MAP_BATCH) {
        const out = await this.llmFor(ctx.kbId)({
          system: BOOK_OUTLINE_MAP_SYSTEM,
          user: sampled.slice(i, i + OUTLINE_MAP_BATCH).join('\n'),
          maxTokens: BRAIN_LLM_MAX_TOKENS
        })
        batchSynopses.push(out.trim())
        stats.calls += 1
      }
      material = batchSynopses.filter(Boolean).join('\n\n')
    }
    const body = await this.llmFor(ctx.kbId)({
      system: BOOK_OUTLINE_REDUCE_SYSTEM,
      user: material,
      maxTokens: BRAIN_LLM_MAX_TOKENS
    })
    stats.calls += 1
    await this.proposeCard(
      ctx.repos,
      ctx.kbId,
      ctx.documentId,
      {
        type: 'book-outline',
        title: `《${docName}》全书概要`,
        description:
          '回答「这本书整体讲什么/主线是什么/怎么分卷分段」时使用：全书主线梗概、结构骨架与核心主题。',
        body
      },
      stats
    )
  }

  /** 设定索引（novel）：本书 setting 层论断 + setting-system 实体摘要 → 归类编纂。
   *  取材严格按文档过滤（review P2）：多文档库下书级卡不能混入他书内容 */
  private async passSettingIndex(
    ctx: { kbId: string; documentId: string; repos: BookPassRepos },
    docName: string,
    stats: Record<string, number>
  ): Promise<void> {
    const atoms = await ctx.repos.atoms.findByKb(ctx.kbId, {
      status: ['supported', 'suspected'],
      layers: ['setting'],
      documentId: ctx.documentId,
      limit: MATERIAL_ATOM_CAP
    })
    const entities = (await ctx.repos.entities.listActiveWithAliases(ctx.kbId, 500))
      .filter(e => e.entityType === 'setting-system')
      .slice(0, 30)
    if (atoms.length === 0 && entities.length === 0) return // 无设定材料（画-pdf错标/还没提到）——零产出合法
    const user = [
      atoms.length ? `设定层论断：\n${atoms.map(a => `- ${a.statement}`).join('\n')}` : '',
      entities.length
        ? `设定体系实体摘要：\n${entities.map(e => `- ${e.name}：${(e.summary ?? '').trim() || '（无摘要）'}`).join('\n')}`
        : ''
    ]
      .filter(Boolean)
      .join('\n\n')
    const body = await this.llmFor(ctx.kbId)({
      system: BOOK_SETTING_INDEX_SYSTEM,
      user,
      maxTokens: BRAIN_LLM_MAX_TOKENS
    })
    stats.calls += 1
    await this.proposeCard(
      ctx.repos,
      ctx.kbId,
      ctx.documentId,
      {
        type: 'setting-index',
        title: `《${docName}》设定索引`,
        description:
          '回答「这个世界如何运转/体系规则/势力地理」时使用：全书设定分类索引。写同类型作品时可作设定清单参照。',
        body
      },
      stats
    )
  }

  /** 人物册（novel/history）：本书论断挂到的人物实体 + 每人代表论断 → 合传 */
  private async passRoster(
    ctx: { kbId: string; documentId: string; repos: BookPassRepos },
    docName: string,
    stats: Record<string, number>
  ): Promise<void> {
    const docAtoms = await ctx.repos.atoms.findByKb(ctx.kbId, {
      status: ['supported'],
      documentId: ctx.documentId,
      limit: 500
    })
    const anchorIds = new Set<string>()
    for (const a of docAtoms) {
      if (a.subjectEntityId) anchorIds.add(a.subjectEntityId)
      if (a.objectEntityId) anchorIds.add(a.objectEntityId)
    }
    const charById = new Map(
      (await ctx.repos.entities.listActiveWithAliases(ctx.kbId, 500))
        .filter(e => e.entityType === 'character')
        .map(c => [c.id, c])
    )
    // 只收本书论断挂到的人物（实体是 KB 级共享的——多文档库不能把他书人物编进本书人物册）
    const characters = [...anchorIds]
      .map(id => charById.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .slice(0, ROSTER_CHAR_CAP)
    if (characters.length < 2) return // 单人成不了"册"
    const sections: string[] = []
    for (const c of characters) {
      const atoms = docAtoms.filter(a => a.subjectEntityId === c.id || a.objectEntityId === c.id)
      const lines = [
        `## ${c.name}`,
        (c.summary ?? '').trim() || '（无摘要）',
        ...atoms.slice(0, ROSTER_ATOMS_PER_CHAR).map(a => `- ${a.statement}`)
      ]
      sections.push(lines.join('\n'))
    }
    const body = await this.llmFor(ctx.kbId)({
      system: BOOK_ROSTER_SYSTEM,
      user: sections.join('\n\n'),
      maxTokens: BRAIN_LLM_MAX_TOKENS
    })
    stats.calls += 1
    await this.proposeCard(
      ctx.repos,
      ctx.kbId,
      ctx.documentId,
      {
        type: 'character-roster',
        title: `《${docName}》人物册`,
        description:
          '回答「某角色是谁/人物关系/角色弧线」或做人物设计参照时使用：主要人物的定位、特质与关键状态。',
        body
      },
      stats
    )
  }

  /** 伏笔台账（novel）：open-question 论断登记在册（回收状态待查） */
  private async passForeshadow(
    ctx: { kbId: string; documentId: string; repos: BookPassRepos },
    docName: string,
    stats: Record<string, number>
  ): Promise<void> {
    const atoms = await ctx.repos.atoms.findByKb(ctx.kbId, {
      status: ['supported', 'suspected'],
      type: 'open-question',
      documentId: ctx.documentId,
      limit: FORESHADOW_CAP
    })
    if (atoms.length === 0) return // 没登记悬置点——零产出合法（宁缺勿滥）
    const body = await this.llmFor(ctx.kbId)({
      system: BOOK_FORESHADOW_SYSTEM,
      user: `悬置点论断：\n${atoms.map(a => `- ${a.statement}`).join('\n')}`,
      maxTokens: BRAIN_LLM_MAX_TOKENS
    })
    stats.calls += 1
    await this.proposeCard(
      ctx.repos,
      ctx.kbId,
      ctx.documentId,
      {
        type: 'foreshadow-ledger',
        title: `《${docName}》伏笔台账`,
        description:
          '检查伏笔回收、规划后文呼应或写同类作品的悬念管理时使用：全书未交代悬置点登记表。',
        body
      },
      stats
    )
  }

  /** 知识体系图（knowledge）：setting/craft 层论断 + 有摘要实体 → 框架卡（v3：outline 层废除） */
  private async passKnowledgeMap(
    ctx: { kbId: string; documentId: string; repos: BookPassRepos },
    docName: string,
    stats: Record<string, number>
  ): Promise<void> {
    const atoms = await ctx.repos.atoms.findByKb(ctx.kbId, {
      status: ['supported', 'suspected'],
      layers: ['setting', 'craft'],
      role: 'knowledge',
      documentId: ctx.documentId,
      limit: MATERIAL_ATOM_CAP
    })
    const entities = (await ctx.repos.entities.listActiveWithAliases(ctx.kbId, 500))
      .filter(e => (e.summary ?? '').trim())
      .slice(0, 30)
    if (atoms.length === 0) return
    const user = [
      `概要/设定层论断：\n${atoms.map(a => `- ${a.statement}`).join('\n')}`,
      entities.length
        ? `核心概念实体摘要：\n${entities.map(e => `- ${e.name}：${e.summary}`).join('\n')}`
        : ''
    ]
      .filter(Boolean)
      .join('\n\n')
    const body = await this.llmFor(ctx.kbId)({
      system: BOOK_KNOWLEDGE_MAP_SYSTEM,
      user,
      maxTokens: BRAIN_LLM_MAX_TOKENS
    })
    stats.calls += 1
    await this.proposeCard(
      ctx.repos,
      ctx.kbId,
      ctx.documentId,
      {
        type: 'knowledge-map',
        title: `《${docName}》知识体系图`,
        description: '快速把握这本书的知识框架、检索概念定义或规划学习路径时使用。',
        body
      },
      stats
    )
  }

  /** 卡片落库：剥代码围栏、同题分状态处置（review P2）、长度护栏。
   *  proposed 同题卡 → 更新 body（version+1，重汇总内容演进）；
   *  published/archived → skip（用户已处置的卡绝不覆盖）——但台账 done 后指纹不变不再重跑，
   *  该 skip 只发生在「指纹变更的重汇总」场景，不构成反复白烧。 */
  private async proposeCard(
    repos: BookPassRepos,
    kbId: string,
    documentId: string,
    card: { type: string; title: string; description: string; body: string },
    stats: Record<string, number>
  ): Promise<void> {
    const clean = card.body
      .trim()
      .replace(/^```(?:markdown|md)?\s*\n?/, '')
      .replace(/\n?```\s*$/, '')
      .trim()
    if (clean.length < 30) return // 空泛/过短正文不成卡（宁缺勿滥）
    const similar = (await repos.notes.findSimilarTitle(kbId, card.title)) as Array<{
      id?: string
      title?: string
      status?: string
    }>
    const sameTitle = similar.find(s => s.title === card.title)
    if (sameTitle) {
      if (
        sameTitle.status === 'proposed' &&
        typeof sameTitle.id === 'string' &&
        repos.notes.updateProposedBody
      ) {
        const updated = await repos.notes.updateProposedBody(sameTitle.id, {
          body: clean.slice(0, CARD_BODY_MAX),
          description: card.description.slice(0, 200)
        })
        if (updated) stats.updated += 1
        return
      }
      stats.merged += 1
      return
    }
    await repos.notes.propose(kbId, {
      title: card.title.slice(0, 120),
      description: card.description.slice(0, 200),
      body: clean.slice(0, CARD_BODY_MAX),
      type: card.type,
      evidence: JSON.stringify([{ documentId }]),
      origin: 'ai-distill'
    })
    stats.cards += 1
  }

  /* ==================== 库级补跑（面板手动入口） ==================== */

  /** 库级书级汇总进行中标记（单飞）与进度（前端轮询） */
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
        lastError: undefined
      }
    )
  }

  /**
   * 老库补跑入口：文档在书级遍功能上线前消化完成（brainStatus=digested），
   * 不会再发 completed 事件——书级卡（全书概要/设定索引/人物册/伏笔台账）永远是空。
   * 本方法按库逐文档补跑（台账幂等：跑过的指纹直接 skip，重复点击安全）。
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
      lastError: undefined
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

/** 均匀采样：超过 cap 时按等距步长抽 cap 条（保序列跨度，不截头） */
export function sampleEvenly<T>(items: T[], cap: number): T[] {
  if (items.length <= cap || cap <= 0) return items
  const out: T[] = []
  const step = items.length / cap
  for (let i = 0; i < cap; i++) out.push(items[Math.floor(i * step)]!)
  return out
}

let singleton: KbBookPassesService | null = null

/** 面板手动补跑用单例（进度/单飞锁挂在实例上；消化链路自建实例不受影响） */
export function getKbBookPassesService(): KbBookPassesService {
  if (!singleton) singleton = new KbBookPassesService()
  return singleton
}
