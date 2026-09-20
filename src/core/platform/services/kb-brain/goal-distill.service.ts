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
import { defaultBrainLlm, type BrainLlmFn } from './llm'
import type { KbBrainGoal } from './brain-config'

const logger = createLogger('KbBrainGoalDistill')

/** 每批章节摘要数（一次调用处理的章数） */
const CHAPTERS_PER_BATCH = 12
/** 单次目标提炼的 map 调用上限（≈480 章；超出说明库太大，应缩小范围/分文档） */
const MAX_BATCHES = 40
/** 单章摘要截断长度（摘要本身短，兜底防超长） */
const SUMMARY_CHARS = 500
/** 精读章数上限（摘要初筛提名后，取分最高的前 N 章读全文） */
const MAX_CLOSE_READ = 12
/** 单章精读正文截断 */
const CLOSE_READ_CHARS = 9000

export interface GoalDistillDeps {
  llm?: BrainLlmFn
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  repos?: () => { docs: KbDocumentRepository; chapters: KbChapterRepository; notes: KbNoteRepository } | null
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

/** 单个提炼目标一次最多产出几张卡（reduce 按主题分组，模型自评 1-3 张） */
const MAX_CARDS_PER_GOAL = 3

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
  private readonly llm: BrainLlmFn
  private readonly reposFn: NonNullable<GoalDistillDeps['repos']>
  /** 进行中的 (kbId:goalId)——单飞防重复点击 */
  private readonly running = new Set<string>()

  constructor(deps: GoalDistillDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate', deps.modelOverride) // 经验提炼走高档
    this.reposFn =
      deps.repos ??
      (() => {
        const db = getCoreDatabaseManager()
        if (!db.kbDocuments || !db.kbChapters || !db.kbNotes) return null
        return { docs: db.kbDocuments, chapters: db.kbChapters, notes: db.kbNotes }
      })
  }

  isRunning(kbId: string, goalId: string): boolean {
    return this.running.has(`${kbId}:${goalId}`)
  }

  /** 某库当前在提炼中的 goalId 列表（前端轮询状态用） */
  runningGoals(kbId: string): string[] {
    const prefix = `${kbId}:`
    return [...this.running].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))
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
    fragmentDocIds: string[],
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
        const raw = await this.llm({ system: MAP_SYSTEM, user, maxTokens: 2500 })
        const parsed = extractJsonFromResponse(raw) as Partial<{ fragments: MapFragment[] }> | null
        for (const f of parsed?.fragments ?? []) {
          if (typeof f?.info !== 'string' || !f.info.trim()) continue
          fragments.push({ chapter: `【精读】${n.label}`, info: f.info, note: typeof f.note === 'string' ? f.note : '' })
          fragmentDocIds.push(n.documentId)
        }
        done++
      } catch (e) {
        logger.warn(`[kb-brain-goal] kb=${kbId} goal=${goal.name} 精读 ${n.label} 失败跳过: ${e instanceof Error ? e.message : String(e)}`)
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
      const chapters = await repos.chapters.findByDocument(doc.id)
      chapters.forEach((c, i) => {
        const summary = c.summary?.trim()
        const text = summary || c.content?.slice(0, SUMMARY_CHARS) || ''
        if (!text) return
        units.push({
          label: `《${book}》#${i + 1} ${c.title}`,
          text: text.slice(0, SUMMARY_CHARS),
          documentId: doc.id,
          chapterId: c.id,
        })
      })
    }
    if (units.length === 0) throw new Error('知识库没有可取材的章节（文档未处理完成或为空）')

    // 2. map：分批提取素材片段（单批失败跳过不废全场——素材收集是尽力而为，还有后续批次和 reduce）
    const fragments: MapFragment[] = []
    const fragmentDocIds: string[] = []
    const nominations: Nomination[] = []
    const batches = Math.min(Math.ceil(units.length / CHAPTERS_PER_BATCH), MAX_BATCHES)
    for (let b = 0; b < batches; b++) {
      const slice = units.slice(b * CHAPTERS_PER_BATCH, (b + 1) * CHAPTERS_PER_BATCH)
      const user = buildMapUser(goal, slice)
      let parsed: Partial<{ fragments: MapFragment[]; nominations: Array<{ chapter: string; reason: string; score: number }> }> | null
      try {
        const raw = await this.llm({ system: MAP_SYSTEM, user, maxTokens: 2500 })
        parsed = extractJsonFromResponse(raw) as typeof parsed
      } catch (e) {
        logger.warn(`[kb-brain-goal] kb=${kbId} goal=${goal.name} 第 ${b + 1}/${batches} 批提取失败，跳过: ${e instanceof Error ? e.message : String(e)}`)
        continue
      }
      for (const f of parsed?.fragments ?? []) {
        if (typeof f?.info !== 'string' || !f.info.trim()) continue
        // 章节标签双向对回取材清单（防幻觉编章）：模型可能回完整标签、只回 #N 标题、或编造——
        // 对不上的强制用本批首个标签：素材必来自本批，编造的出处比「近似但可能不准」的标注更糟
        const matched = slice.find(
          (u) =>
            (typeof f.chapter === 'string' && f.chapter.includes(u.label.slice(1, 20))) ||
            (typeof f.chapter === 'string' && u.label.includes(f.chapter.trim())),
        )
        fragments.push({ chapter: matched?.label ?? slice[0].label, info: f.info, note: typeof f.note === 'string' ? f.note : '' })
        fragmentDocIds.push(matched?.documentId ?? slice[0].documentId)
      }
      // 提名收集：值得读全文的章（score 1-5，标签对不回取材清单则丢弃）
      for (const n of parsed?.nominations ?? []) {
        if (typeof n?.chapter !== 'string') continue
        const matched = slice.find(
          (u) => u.label.includes(n.chapter.trim()) || n.chapter.includes(u.label.slice(1, 20)),
        )
        if (!matched) continue
        nominations.push({
          label: matched.label,
          chapterId: matched.chapterId,
          documentId: matched.documentId,
          score: Number(n.score) || 3,
          reason: typeof n.reason === 'string' ? n.reason : '',
        })
      }
    }
    if (batches >= MAX_BATCHES && units.length > MAX_BATCHES * CHAPTERS_PER_BATCH) {
      logger.warn(`[kb-brain-goal] kb=${kbId} 章节 ${units.length} 超出单次上限，只取前 ${MAX_BATCHES * CHAPTERS_PER_BATCH} 章`)
    }

    // 2.5 精读：提名章读全文（摘要只能指出"哪里可能有货"，写法层面的经验必须读原文）
    const closeReadN = await this.closeReadStage(kbId, goal, repos, nominations, fragments, fragmentDocIds)
    void closeReadN
    if (fragments.length === 0) {
      return { batches, fragments: 0, proposed: false, skippedDuplicate: false, cardTitle: null, cards: 0 }
    }

    // 3. reduce：素材 → 1-N 张经验卡（失败重试 1 次，带错误回喂）
    interface ReduceCard {
      title: string
      description: string
      body: string
    }
    let cards: ReduceCard[] = []
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const user = buildReduceUser(goal, fragments) + (lastError ? `\n\n【上次输出不合法】\n${lastError}\n请重新输出完整合法的 JSON。` : '')
      try {
        const raw = await this.llm({ system: REDUCE_SYSTEM, user, maxTokens: 9000 })
        const parsed = extractJsonFromResponse(raw) as Partial<{ cards: unknown; title: unknown; body: unknown }> | null
        // 新契约 {cards:[...]}；兼容旧单卡 {title,description,body}
        const rawCards: unknown[] = Array.isArray(parsed?.cards)
          ? (parsed!.cards as unknown[])
          : parsed && typeof parsed === 'object' && typeof parsed.title === 'string' && typeof parsed.body === 'string'
            ? [parsed]
            : []
        const cleaned: ReduceCard[] = rawCards
          .map((c) => c as Partial<ReduceCard>)
          .filter((c) => typeof c?.body === 'string' && c.body.trim())
          .map((c) => ({
            title: (typeof c.title === 'string' && c.title.trim()) || `经验：${goal.name}`,
            description: (typeof c.description === 'string' && c.description.trim()) || `从本书提炼的「${goal.name}」经验`,
            body: (c as { body: string }).body,
          }))
        if (cleaned.length === 0) throw new Error('cards 为空或缺少 body')
        cards = cleaned.slice(0, MAX_CARDS_PER_GOAL)
        break
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    if (cards.length === 0) throw new Error(`经验卡生成失败：${lastError}`)

    // 4. 逐张入提议箱（同题非重名去重；AI 产物永不直接 published）
    let proposedCount = 0
    let skippedDup = false
    for (const card of cards) {
      const similar = await repos.notes.findSimilarTitle(kbId, card.title)
      if (similar.some((s) => s.title === card.title && s.status !== 'archived')) {
        skippedDup = true
        continue
      }
      await repos.notes.propose(kbId, {
        title: card.title,
        description: card.description,
        body: card.body,
        type: 'synthesis',
        evidence: JSON.stringify(
          fragments.slice(0, 30).map((f, i) => ({ quote: f.chapter, documentId: fragmentDocIds[i], note: f.note })),
        ),
        origin: 'ai-distill',
      })
      proposedCount++
    }
    return {
      batches,
      fragments: fragments.length,
      proposed: proposedCount > 0,
      skippedDuplicate: skippedDup && proposedCount === 0,
      cardTitle: cards[0]!.title,
      cards: proposedCount,
    }
  }
}

/** 文件名 → 短书名：去扩展名、去括注（校对版/来源站等）、去「作者-」前缀——出处标签可读 */
export function shortBookName(fileName: string): string {
  const noExt = fileName.replace(/\.(epub|mobi|azw3|txt|pdf|docx?)\s*$/i, '')
  const noParens = noExt.replace(/[（(【[].*$/, '').trim()
  const noDash = noParens.includes('-') && noParens.indexOf('-') <= 6
    ? noParens.slice(noParens.indexOf('-') + 1).trim()
    : noParens
  return noDash || fileName
}

function buildMapUser(goal: KbBrainGoal, slice: Array<{ label: string; text: string }>): string {
  const lines = slice.map((u) => `【${u.label}】\n${u.text}`)
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
    ...lines,
  ].join('\n')
}

function buildCloseReadUser(goal: KbBrainGoal, n: Nomination, content: string): string {
  return [
    `【提炼目标】${goal.name}`,
    goal.hint,
    '',
    `下面是提名章的全文（${n.label}，提名理由：${n.reason || '与目标相关'}）。`,
    '细读原文，提取与提炼目标直接相关的素材——写法层面（怎么写的）与设定层面（写了什么）并重，输出 JSON：',
    '{"fragments":[{"chapter":"' + n.label + '","info":"具体信息，引用/概括原文关键句","note":"一句话说明它对目标的价值"}]}',
    '没有相关内容就输出 {"fragments":[]}。禁止编造原文没有的信息。',
    '',
    '【章全文】',
    content,
  ].join('\n')
}

function buildReduceUser(goal: KbBrainGoal, fragments: MapFragment[]): string {
  const lines = fragments.map((f) => `- [${f.chapter}] ${f.info}${f.note ? `（${f.note}）` : ''}`)
  return [
    `【提炼目标】${goal.name}`,
    goal.hint,
    '',
    '以下是从全书各章提取的相关素材（方括号内是出处）。据此提炼 1-3 张可复用的创作方法论卡：',
    '素材能分出几个独立主题就出几张（每张卡聚焦一个主题），只够一张就一张，禁止硬凑或重复。',
    '输出 JSON：',
    '{"cards":[{"title":"卡片标题（直接给论断本身，禁止出现「论断式标题」等指令词或前缀）","description":"何时用我（第三人称，≤200字，含触发场景）","body":"markdown 正文"}]}',
    '每张卡的正文 ≤1800 字：把素材写深写透——每小节给出具体手法、运作原理、例证出处与迁移条件，宁可一卡精耕，不要泛泛而谈；',
    '每张卡的正文要求：',
    '1) 按提炼目标 hint 指定的结构分小节组织；',
    '2) 每条经验/结论后标注出处（如 [《书名》#12 章节]），多章印证的列多个；',
    '3) 提炼可复用的模式与规则（何时用/怎么用/何时失效），不复述剧情；',
    '4) 素材不足的部分明确写「素材不足，待补充」，禁止编造。',
    '',
    '【素材】',
    ...lines,
  ].join('\n')
}
