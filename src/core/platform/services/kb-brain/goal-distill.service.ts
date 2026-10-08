/**
 * 知识大脑·提取目标提炼（经验维度，两段 map-reduce）
 * @module platform/services/kb-brain/goal-distill.service
 *
 * 用户在 brainConfig.goals 里按项目定义「要提炼什么经验」（如修真体系/
 * 写作套路/经典场面/人物亮点——机制通用，内容是数据）：
 *   map：章节摘要分批过 LLM → 与目标相关的素材片段（带出处标签）
 *   reduce：素材汇成一份结构化经验卡（markdown，proposed 走提议箱人审）
 *
 * 与 P2 重要性提炼的分工：P2 从 L1 论断底账自发浮现模式（不用配置）；
 * 本服务是目标驱动的定向深挖（用户明确要什么才跑，成本可控）。
 * 取材用章节摘要而非全文：一部百万字书 ≈ 十几次调用而非几百次。
 */
import { createLogger } from '@core/utils/logger'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import type { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import type { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import {
  createKbScopedLlm,
  BRAIN_LLM_MAX_TOKENS,
  type BrainLlmFn,
  type BrainModelRef,
  type KbScopedLlm
} from './llm'
import type { KbBrainGoal } from './brain-config'
import { isNonNarrativeChapter } from './digest-orchestrator.service'

const logger = createLogger('KbBrainGoalDistill')

/** 每批章节摘要数（一次调用处理的章数） */
const CHAPTERS_PER_BATCH = 12
/** 单次目标提炼的 map 调用上限（≈480 章；超出按均匀采样覆盖全书，不做截头） */
const MAX_BATCHES = 40
/** 单章取材文本上限（摘要优先；无摘要回退正文前段——过短只剩场景铺垫，素材贫乏直接拉低成卡质量） */
const SUMMARY_CHARS = 1500
/** 精读章数上限（摘要初筛提名后，取分最高的前 N 章读全文） */
const MAX_CLOSE_READ = 20
/** 单章精读正文截断 */
const CLOSE_READ_CHARS = 12000

export interface GoalDistillDeps {
  llm?: BrainLlmFn
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  repos?: () => {
    docs: KbDocumentRepository
    chapters: KbChapterRepository
    notes: KbNoteRepository
  } | null
}

export interface GoalDistillOutcome {
  batches: number
  fragments: number
  proposed: boolean
  skippedDuplicate: boolean
  cardTitle: string | null
  /** 本轮实际入提议箱的卡数（reduce 一次可产 1-N 张） */
  cards: number
}

/** 单目标一次最多分几个主题（=卡数上限；由素材主题数驱动，非产出限制——审批有批量动线） */
const MAX_THEMES_PER_GOAL = 8

const MAP_SYSTEM =
  '你是资深图书编辑，正在为写作知识库定向提取经验素材。只输出 JSON，不输出任何其他文字。'

const REDUCE_SYSTEM =
  '你是资深图书编辑，擅长把作品素材提炼成可迁移的创作方法论。' +
  '卡必须是方法论而非作品分析：跨书可用、写清何时用/怎么用/何时会失效，禁止复述情节。' +
  '只输出 JSON，不输出任何其他文字。'

interface MapFragment {
  chapter: string
  info: string
  note: string
  /** 溯源（evidence 程序化跳转的前置；map 阶段标签对回取材清单时透传） */
  documentId?: string
  chapterId?: string
}

/** 摘要初筛提名：值得读全文的章（场面/设定密集处） */
interface Nomination {
  label: string
  chapterId: string
  documentId: string
  score: number
  reason: string
}

export class KbGoalDistillService {
  private readonly scoped: KbScopedLlm
  private readonly reposFn: NonNullable<GoalDistillDeps['repos']>
  /** 进行中的 (kbId:goalId)——单飞防重复点击 */
  private readonly running = new Set<string>()

  constructor(deps: GoalDistillDeps = {}) {
    // 经验提炼走高档。模型解析按 kbId 隔离（review M7）：单例并发跑多库时，
    // 共享 override 会让 A 库进行中的调用解析到 B 库的模型
    this.scoped = createKbScopedLlm('kb-brain-adjudicate', {
      injected: deps.llm,
      fallback: deps.modelOverride
    })
    this.reposFn =
      deps.repos ??
      (() => {
        const db = getCoreDatabaseManager()
        if (!db.kbDocuments || !db.kbChapters || !db.kbNotes) return null
        return { docs: db.kbDocuments, chapters: db.kbChapters, notes: db.kbNotes }
      })
  }

  private llmFor(kbId: string): BrainLlmFn {
    return this.scoped.llmFor(kbId)
  }

  isRunning(kbId: string, goalId: string): boolean {
    return this.running.has(`${kbId}:${goalId}`)
  }

  /** 注入每库模型解析（runGoal 前按 kbId 调用；llm 为注入型时无效） */
  setModelOverride(kbId: string, fn: () => BrainModelRef): void {
    this.scoped.setOverride(kbId, fn)
  }

  /** 某库当前在提炼中的 goalId 列表（前端轮询状态用） */
  runningGoals(kbId: string): string[] {
    const prefix = `${kbId}:`
    return [...this.running].filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length))
  }

  async runGoal(kbId: string, goal: KbBrainGoal): Promise<GoalDistillOutcome> {
    const key = `${kbId}:${goal.id}`
    if (this.running.has(key)) throw new Error(`目标「${goal.name}」提炼进行中，请稍候`)
    this.running.add(key)
    try {
      return await this.doRun(kbId, goal)
    } finally {
      this.running.delete(key)
    }
  }

  /**
   * 精读阶段：提名章取全文（每章截 CLOSE_READ_CHARS），逐章深读产出高质量素材。
   * 单章失败跳过；无提名直接返回 0。素材以【精读】前缀并入 fragments。
   */
  private async closeReadStage(
    kbId: string,
    goal: KbBrainGoal,
    repos: { chapters: KbChapterRepository },
    nominations: Nomination[],
    fragments: MapFragment[],
    fragmentDocIds: string[]
  ): Promise<number> {
    if (nominations.length === 0) return 0
    const top = [...nominations].sort((a, b) => b.score - a.score).slice(0, MAX_CLOSE_READ)
    let done = 0
    for (const n of top) {
      try {
        const chapter = await repos.chapters.findById(n.chapterId)
        const content = chapter?.content?.trim()
        if (!content) continue
        const user = buildCloseReadUser(goal, n, content.slice(0, CLOSE_READ_CHARS))
        // 6000：推理型模型思考计入输出预算，2500 会被耗尽返回空文本（deepseek 真机实证）
        const raw = await this.llmFor(kbId)({
          system: MAP_SYSTEM,
          user,
          maxTokens: BRAIN_LLM_MAX_TOKENS
        })
        const parsed = extractJsonFromResponse(raw) as Partial<{ fragments: MapFragment[] }> | null
        for (const f of parsed?.fragments ?? []) {
          if (typeof f?.info !== 'string' || !f.info.trim()) continue
          fragments.push({
            chapter: `【精读】${n.label}`,
            info: f.info,
            note: typeof f.note === 'string' ? f.note : '',
            documentId: n.documentId,
            chapterId: n.chapterId
          })
          fragmentDocIds.push(n.documentId)
        }
        done++
      } catch (e) {
        logger.warn(
          `[kb-brain-goal] kb=${kbId} goal=${goal.name} 精读 ${n.label} 失败跳过: ${e instanceof Error ? e.message : String(e)}`
        )
      }
    }
    logger.info(`[kb-brain-goal] kb=${kbId} goal=${goal.name} 精读完成 ${done}/${top.length} 章`)
    return done
  }

  private async doRun(kbId: string, goal: KbBrainGoal): Promise<GoalDistillOutcome> {
    const repos = this.reposFn()
    if (!repos) throw new Error('知识大脑未启用（旧库）')

    // 1. 取材：全库章节摘要（未生成摘要的回退正文前段）
    const docs = await repos.docs.findByKnowledgeBaseId(kbId)
    const units: Array<{ label: string; text: string; documentId: string; chapterId: string }> = []
    for (const doc of docs) {
      const book = shortBookName(doc.name)
      // 摘要缺失时回退正文采样 → 需要 content（显式 opt-in）
      const chapters = await repos.chapters.findByDocument(doc.id, { includeContent: true })
      chapters.forEach((c, i) => {
        // 非叙事章节（版权/简介/评析/剧照等前置页）不进取材——书评摘录会污染经验卡
        if (isNonNarrativeChapter(c.title, c.parentTitle)) return
        const summary = c.summary?.trim()
        const text = summary || c.content?.slice(0, SUMMARY_CHARS) || ''
        if (!text) return
        units.push({
          label: `《${book}》#${i + 1} ${c.title}`,
          text: text.slice(0, SUMMARY_CHARS),
          documentId: doc.id,
          chapterId: c.id
        })
      })
    }
    if (units.length === 0) throw new Error('知识库没有可取材的章节（文档未处理完成或为空）')

    // 1.5 超出单次容量时按文档配额均匀采样（截头 = 大库只见第一本书的开头，
    // 其余书永远不进素材——「提炼了但看不到产出」的主因之一）
    const capacity = MAX_BATCHES * CHAPTERS_PER_BATCH
    const sampled = sampleUnitsEvenly(units, capacity)

    // 2. map：分批提取素材片段（单批失败跳过不废全场——素材收集是尽力而为，还有后续批次和 reduce）
    const fragments: MapFragment[] = []
    const fragmentDocIds: string[] = []
    const nominations: Nomination[] = []
    const batches = Math.min(Math.ceil(sampled.length / CHAPTERS_PER_BATCH), MAX_BATCHES)
    for (let b = 0; b < batches; b++) {
      const slice = sampled.slice(b * CHAPTERS_PER_BATCH, (b + 1) * CHAPTERS_PER_BATCH)
      const user = buildMapUser(goal, slice)
      let parsed: Partial<{
        fragments: MapFragment[]
        nominations: Array<{ chapter: string; reason: string; score: number }>
      }> | null
      try {
        // 6000：推理型模型思考计入输出预算，2500 会被耗尽返回空文本（deepseek 真机实证）
        const raw = await this.llmFor(kbId)({
          system: MAP_SYSTEM,
          user,
          maxTokens: BRAIN_LLM_MAX_TOKENS
        })
        parsed = extractJsonFromResponse(raw) as typeof parsed
      } catch (e) {
        logger.warn(
          `[kb-brain-goal] kb=${kbId} goal=${goal.name} 第 ${b + 1}/${batches} 批提取失败，跳过: ${e instanceof Error ? e.message : String(e)}`
        )
        continue
      }
      for (const f of parsed?.fragments ?? []) {
        if (typeof f?.info !== 'string' || !f.info.trim()) continue
        // 章节标签双向对回取材清单（防幻觉编章）：模型可能回完整标签、只回 #N 标题、或编造——
        // 对不上的强制用本批首个标签：素材必来自本批，编造的出处比「近似但可能不准」的标注更糟
        const matched = slice.find(
          u =>
            (typeof f.chapter === 'string' && f.chapter.includes(u.label.slice(1, 20))) ||
            (typeof f.chapter === 'string' && u.label.includes(f.chapter.trim()))
        )
        fragments.push({
          chapter: matched?.label ?? slice[0].label,
          info: f.info,
          note: typeof f.note === 'string' ? f.note : '',
          documentId: matched?.documentId ?? slice[0].documentId,
          chapterId: matched?.chapterId
        })
        fragmentDocIds.push(matched?.documentId ?? slice[0].documentId)
      }
      // 提名收集：值得读全文的章（score 1-5，标签对不回取材清单则丢弃）
      for (const n of parsed?.nominations ?? []) {
        if (typeof n?.chapter !== 'string') continue
        const matched = slice.find(
          u => u.label.includes(n.chapter.trim()) || n.chapter.includes(u.label.slice(1, 20))
        )
        if (!matched) continue
        nominations.push({
          label: matched.label,
          chapterId: matched.chapterId,
          documentId: matched.documentId,
          score: Number(n.score) || 3,
          reason: typeof n.reason === 'string' ? n.reason : ''
        })
      }
    }
    if (batches >= MAX_BATCHES && sampled.length > MAX_BATCHES * CHAPTERS_PER_BATCH) {
      logger.warn(
        `[kb-brain-goal] kb=${kbId} goal=${goal.name} 章节 ${units.length} 超出单次上限，均匀采样 ${sampled.length} 章覆盖全书`
      )
    }

    // 2.5 精读：提名章读全文（摘要只能指出"哪里可能有货"，写法层面的经验必须读原文）
    const closeReadN = await this.closeReadStage(
      kbId,
      goal,
      repos,
      nominations,
      fragments,
      fragmentDocIds
    )
    void closeReadN
    if (fragments.length === 0) {
      return {
        batches,
        fragments: 0,
        proposed: false,
        skippedDuplicate: false,
        cardTitle: null,
        cards: 0
      }
    }

    // 3. reduce 两段式：先按素材分主题，再逐主题各出一张卡——
    //    每次调用只写一张卡，篇幅不被单次输出上限挤压；主题数由素材驱动，审批走批量动线
    if (fragments.length < 2) {
      // 单条素材凑不成主题组（每组需 ≥2 条）——安静返回，不报错不硬出卡
      return {
        batches,
        fragments: fragments.length,
        proposed: false,
        skippedDuplicate: false,
        cardTitle: null,
        cards: 0
      }
    }
    // 3a. 主题分组（失败重试 1 次）
    interface ReduceCard {
      title: string
      description: string
      body: string
    }
    interface ThemeGroup {
      name: string
      idx: number[]
    }
    let themes: ThemeGroup[] = []
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const user =
        buildThemesUser(goal, fragments) +
        (lastError ? `\n\n【上次输出不合法】\n${lastError}\n请重新输出完整合法的 JSON。` : '')
      try {
        const raw = await this.llmFor(kbId)({
          system: REDUCE_SYSTEM,
          user,
          maxTokens: BRAIN_LLM_MAX_TOKENS
        })
        const parsed = extractJsonFromResponse(raw) as Partial<{ themes: unknown }> | null
        const inBounds = (i: unknown): i is number =>
          Number.isInteger(i) && (i as number) >= 0 && (i as number) < fragments.length
        const cleaned: ThemeGroup[] = (
          Array.isArray(parsed?.themes) ? (parsed!.themes as unknown[]) : []
        )
          .map(t => t as Partial<ThemeGroup>)
          .filter(t => typeof t?.name === 'string' && t.name.trim() && Array.isArray(t.idx))
          .map(t => ({
            name: (t as { name: string }).name.trim(),
            idx: [...new Set((t as { idx: unknown[] }).idx.filter(inBounds))]
          }))
          .filter(t => t.idx.length >= 2) // 单条素材不成卡
        if (cleaned.length === 0) throw new Error('themes 为空或全部非法')
        // 重名主题加序号后缀：防止 fallback 标题碰撞后被同题去重静默吞卡
        const seenName = new Set<string>()
        for (const t of cleaned) {
          if (seenName.has(t.name)) {
            let n = 2
            while (seenName.has(`${t.name}#${n}`)) n++
            t.name = `${t.name}#${n}`
          }
          seenName.add(t.name)
        }
        if (cleaned.length > MAX_THEMES_PER_GOAL) {
          logger.warn(
            `[kb-brain-goal] 主题数 ${cleaned.length} 超上限，裁到 ${MAX_THEMES_PER_GOAL}`
          )
        }
        themes = cleaned.slice(0, MAX_THEMES_PER_GOAL)
        break
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    if (themes.length === 0) throw new Error(`素材主题分组失败：${lastError}`)

    // 3b. 逐主题出卡（每主题独立调用，失败跳过该主题不废全场）
    const cards: ReduceCard[] = []
    const evidences: string[] = []
    for (const theme of themes) {
      const themedFrags = theme.idx.map(i => fragments[i]!).filter(Boolean)
      if (themedFrags.length < 2) continue
      // 卡级证据：只挂本主题素材（前 30 条），quote=章节标签（人读）+ documentId/chapterId（程序跳转）
      const cardEvidence = JSON.stringify(
        themedFrags
          .slice(0, 30)
          .map(f => ({
            quote: f.chapter,
            note: f.note,
            documentId: f.documentId,
            chapterId: f.chapterId
          }))
      )
      let card: ReduceCard | null = null
      let cardError = ''
      for (let attempt = 0; attempt < 2; attempt++) {
        const user =
          buildThemeCardUser(goal, theme.name, themedFrags) +
          (cardError ? `\n\n【上次输出不合法】\n${cardError}\n请重新输出完整合法的 JSON。` : '')
        try {
          const raw = await this.llmFor(kbId)({
            system: REDUCE_SYSTEM,
            user,
            maxTokens: BRAIN_LLM_MAX_TOKENS
          })
          const parsed = extractJsonFromResponse(raw) as Partial<ReduceCard> | null
          if (!parsed?.body || typeof parsed.body !== 'string' || !parsed.body.trim()) {
            throw new Error('缺少 body')
          }
          card = {
            title:
              (typeof parsed.title === 'string' && parsed.title.trim()) ||
              `经验：${goal.name}·${theme.name}`,
            description:
              (typeof parsed.description === 'string' && parsed.description.trim()) ||
              `从本书提炼的「${goal.name}」经验`,
            body: parsed.body
          }
          break
        } catch (e) {
          cardError = e instanceof Error ? e.message : String(e)
        }
      }
      if (card) {
        cards.push(card)
        evidences.push(cardEvidence)
      } else {
        logger.warn(`[kb-brain-goal] 主题「${theme.name}」两次出卡失败，跳过：${cardError}`)
      }
    }
    if (cards.length === 0) throw new Error('经验卡生成失败：全部主题出卡失败')

    // 4. 逐张入提议箱（同题非重名去重；AI 产物永不直接 published）
    let proposedCount = 0
    let skippedDup = false
    for (const card of cards) {
      const similar = await repos.notes.findSimilarTitle(kbId, card.title)
      if (similar.some(s => s.title === card.title && s.status !== 'archived')) {
        skippedDup = true
        continue
      }
      await repos.notes.propose(kbId, {
        title: card.title,
        description: card.description,
        body: card.body,
        type: 'synthesis',
        evidence: evidences[proposedCount] ?? '[]',
        origin: 'ai-distill',
        // 目标标记：卡是哪个提炼目标产的——待审箱/经验卡按此显示「来源目标」，
        // 用户不再面对一堆不知类型的 synthesis 碎片卡
        tags: JSON.stringify([`goal:${goal.id}`, `goal-name:${goal.name}`])
      })
      proposedCount++
    }
    return {
      batches,
      fragments: fragments.length,
      proposed: proposedCount > 0,
      skippedDuplicate: skippedDup && proposedCount === 0,
      cardTitle: cards[0]!.title,
      cards: proposedCount
    }
  }
}

let singleton: KbGoalDistillService | null = null

/** 共享单例：面板手动提炼与后台自动化共用（running 单飞锁全局一致，互斥不重跑） */
export function getKbGoalDistillService(): KbGoalDistillService {
  if (!singleton) singleton = new KbGoalDistillService()
  return singleton
}

/** 文件名 → 短书名：去扩展名、去括注（校对版/来源站等）、去「作者-」前缀——出处标签可读 */
export function shortBookName(fileName: string): string {
  const noExt = fileName.replace(/\.(epub|mobi|azw3|txt|pdf|docx?)\s*$/i, '')
  const noParens = noExt.replace(/[（(【[].*$/, '').trim()
  const noDash =
    noParens.includes('-') && noParens.indexOf('-') <= 6
      ? noParens.slice(noParens.indexOf('-') + 1).trim()
      : noParens
  return noDash || fileName
}

/**
 * 取材均匀采样：总章数超出单次容量时，按文档篇幅比例分配名额、文档内等距抽取
 * （保每本书的开头-中段-结局都进素材；截头会让多书库只提炼到第一本的开头）。
 */
export function sampleUnitsEvenly<T extends { documentId: string }>(
  units: T[],
  capacity: number
): T[] {
  if (units.length <= capacity) return units
  const byDoc = new Map<string, T[]>()
  for (const u of units) {
    const arr = byDoc.get(u.documentId) ?? []
    arr.push(u)
    byDoc.set(u.documentId, arr)
  }
  const docs = [...byDoc.values()]
  const out: T[] = []
  let remaining = capacity
  docs.forEach((docUnits, di) => {
    // 按篇幅比例分配（最后一档吃余量，避免取整误差丢名额）
    const quota =
      di === docs.length - 1
        ? remaining
        : Math.max(1, Math.round((docUnits.length / units.length) * capacity))
    const take = Math.min(quota, remaining, docUnits.length)
    remaining -= take
    const step = docUnits.length / take
    for (let i = 0; i < take; i++) out.push(docUnits[Math.floor(i * step)]!)
  })
  return out
}

function buildMapUser(goal: KbBrainGoal, slice: Array<{ label: string; text: string }>): string {
  const lines = slice.map(u => `【${u.label}】\n${u.text}`)
  return [
    `【提炼目标】${goal.name}`,
    goal.hint,
    '',
    '下面是若干章节的摘要。完成两件事，输出 JSON：',
    '1) fragments：提取与提炼目标直接相关的信息',
    '   {"fragments":[{"chapter":"<原样复制该章的【】内标签>","info":"具体信息，保留专有名词/数值/结构","note":"一句话说明它对目标的价值"}]}',
    '2) nominations：如果某章摘要显示它可能包含与目标高度相关的重要内容',
    '   （关键场面/核心设定/重大转折——值得读原文细看写法），提名它：',
    '   {"nominations":[{"chapter":"<该章【】内标签>","reason":"提名理由一句话","score":1到5}]}',
    '   宁缺毋滥，最多提名 3 章。',
    '没有相关内容就输出 {"fragments":[],"nominations":[]}。禁止编造摘要中没有的信息。',
    '',
    '【章节摘要】',
    ...lines
  ].join('\n')
}

function buildCloseReadUser(goal: KbBrainGoal, n: Nomination, content: string): string {
  return [
    `【提炼目标】${goal.name}`,
    goal.hint,
    '',
    `下面是提名章的全文（${n.label}，提名理由：${n.reason || '与目标相关'}）。`,
    '细读原文，提取与提炼目标直接相关的素材——写法层面（怎么写的）与设定层面（写了什么）并重，输出 JSON：',
    '{"fragments":[{"chapter":"' +
      n.label +
      '","info":"具体信息，引用/概括原文关键句","note":"一句话说明它对目标的价值"}]}',
    '没有相关内容就输出 {"fragments":[]}。禁止编造原文没有的信息。',
    '',
    '【章全文】',
    content
  ].join('\n')
}

/** 主题分组（reduce 第一段）：只分组不写卡——组数由素材主题数决定，每次调用不受多卡篇幅挤压 */
function buildThemesUser(goal: KbBrainGoal, fragments: MapFragment[]): string {
  const lines = fragments.map(
    (f, i) => `[${i}] [${f.chapter}] ${f.info}${f.note ? `（${f.note}）` : ''}`
  )
  return [
    '【主题分组】',
    `【提炼目标】${goal.name}`,
    goal.hint,
    '',
    '以下是从全书各章提取的创作素材（[编号] + 方括号内是出处）。请把素材按主题分组：',
    '每一组 = 能独立写成一张创作方法论卡的一簇素材。',
    '组数由素材决定：有几组写得成卡的就分几组，宁多勿漏（最多 8 组，超出取最有价值的）；确实同源的手法才合并，禁止把能独立成卡的主题硬凑进一组；',
    '主题之间素材尽量不重叠——两卡共用大部分素材只会产出重复卡。',
    '输出 JSON：',
    '{"themes":[{"name":"主题名（短语）","idx":[素材编号数组]}]}',
    '要求：每个 idx 至少 2 条；同一素材确实与多个主题都相关时可重复出现；禁止编造编号。',
    '',
    '【素材】',
    ...lines
  ].join('\n')
}

/** 逐主题出卡（reduce 第二段）：一次调用只写一张卡，正文预算完整 */
function buildThemeCardUser(
  goal: KbBrainGoal,
  themeName: string,
  fragments: MapFragment[]
): string {
  const lines = fragments.map(f => `- [${f.chapter}] ${f.info}${f.note ? `（${f.note}）` : ''}`)
  return [
    `【提炼目标】${goal.name}`,
    goal.hint,
    `【当前主题】${themeName}`,
    '',
    '以下是与该主题相关的素材（方括号内是出处）。据此提炼一张可复用的创作方法论卡，输出 JSON：',
    '{"title":"卡片标题（直接给论断本身，禁止出现「论断式标题」等指令词或前缀）","description":"何时用我（第三人称，≤200字，含触发场景）","body":"markdown 正文"}',
    '正文 ≤1800 字：把素材写深写透——',
    '1) 按提炼目标 hint 指定的结构分小节组织；',
    '2) 每条经验/结论后标注出处（如 [《书名》#12 章节]），多章印证的列多个；',
    '3) 提炼可复用的模式与规则（何时用/怎么用/何时失效），不复述剧情；',
    '4) 素材不足的部分明确写「素材不足，待补充」，禁止编造。',
    '',
    '【素材】',
    ...lines
  ].join('\n')
}
