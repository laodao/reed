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
}

const MAP_SYSTEM =
  '你是资深图书编辑，正在为写作知识库定向提取经验素材。只输出 JSON，不输出任何其他文字。'

const REDUCE_SYSTEM =
  '你是资深图书编辑，擅长从素材中提炼可复用的创作经验。只输出 JSON，不输出任何其他文字。'

interface MapFragment {
  chapter: string
  info: string
  note: string
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

  private async doRun(kbId: string, goal: KbBrainGoal): Promise<GoalDistillOutcome> {
    const repos = this.reposFn()
    if (!repos) throw new Error('知识大脑未启用（旧库）')

    // 1. 取材：全库章节摘要（未生成摘要的回退正文前段）
    const docs = await repos.docs.findByKnowledgeBaseId(kbId)
    const units: Array<{ label: string; text: string; documentId: string }> = []
    for (const doc of docs) {
      const chapters = await repos.chapters.findByDocument(doc.id)
      chapters.forEach((c, i) => {
        const summary = c.summary?.trim()
        const text = summary || c.content?.slice(0, SUMMARY_CHARS) || ''
        if (!text) return
        units.push({
          label: `《${doc.name}》#${i + 1} ${c.title}`,
          text: text.slice(0, SUMMARY_CHARS),
          documentId: doc.id,
        })
      })
    }
    if (units.length === 0) throw new Error('知识库没有可取材的章节（文档未处理完成或为空）')

    // 2. map：分批提取素材片段（单批失败跳过不废全场——素材收集是尽力而为，还有后续批次和 reduce）
    const fragments: MapFragment[] = []
    const fragmentDocIds: string[] = []
    const batches = Math.min(Math.ceil(units.length / CHAPTERS_PER_BATCH), MAX_BATCHES)
    for (let b = 0; b < batches; b++) {
      const slice = units.slice(b * CHAPTERS_PER_BATCH, (b + 1) * CHAPTERS_PER_BATCH)
      const user = buildMapUser(goal, slice)
      let parsed: Partial<{ fragments: MapFragment[] }> | null
      try {
        const raw = await this.llm({ system: MAP_SYSTEM, user, maxTokens: 2500 })
        parsed = extractJsonFromResponse(raw) as Partial<{ fragments: MapFragment[] }> | null
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
    }
    if (batches >= MAX_BATCHES && units.length > MAX_BATCHES * CHAPTERS_PER_BATCH) {
      logger.warn(`[kb-brain-goal] kb=${kbId} 章节 ${units.length} 超出单次上限，只取前 ${MAX_BATCHES * CHAPTERS_PER_BATCH} 章`)
    }
    if (fragments.length === 0) {
      return { batches, fragments: 0, proposed: false, skippedDuplicate: false, cardTitle: null }
    }

    // 3. reduce：素材 → 经验卡（失败重试 1 次，带错误回喂）
    let card: { title: string; description: string; body: string } | null = null
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const user = buildReduceUser(goal, fragments) + (lastError ? `\n\n【上次输出不合法】\n${lastError}\n请重新输出完整合法的 JSON。` : '')
      try {
        const raw = await this.llm({ system: REDUCE_SYSTEM, user, maxTokens: 6000 })
        const parsed = extractJsonFromResponse(raw) as Partial<{ title: string; description: string; body: string }> | null
        if (!parsed?.body || typeof parsed.body !== 'string' || !parsed.body.trim()) {
          throw new Error('缺少 body')
        }
        card = {
          title: parsed.title?.trim() || `经验：${goal.name}`,
          description: parsed.description?.trim() || `从本书提炼的「${goal.name}」经验`,
          body: parsed.body,
        }
        break
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    if (!card) throw new Error(`经验卡生成失败：${lastError}`)

    // 4. 入提议箱（同题非重名去重；AI 产物永不直接 published）
    const similar = await repos.notes.findSimilarTitle(kbId, card.title)
    if (similar.some((s) => s.title === card!.title && s.status !== 'archived')) {
      return { batches, fragments: fragments.length, proposed: false, skippedDuplicate: true, cardTitle: card.title }
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
    return { batches, fragments: fragments.length, proposed: true, skippedDuplicate: false, cardTitle: card.title }
  }
}

function buildMapUser(goal: KbBrainGoal, slice: Array<{ label: string; text: string }>): string {
  const lines = slice.map((u) => `【${u.label}】\n${u.text}`)
  return [
    `【提炼目标】${goal.name}`,
    goal.hint,
    '',
    '下面是若干章节的摘要。只提取与提炼目标直接相关的信息，输出 JSON：',
    '{"fragments":[{"chapter":"<原样复制该章的【】内标签>","info":"具体信息，保留专有名词/数值/结构","note":"一句话说明它对目标的价值"}]}',
    '没有相关内容就输出 {"fragments":[]}。禁止编造摘要中没有的信息。',
    '',
    '【章节摘要】',
    ...lines,
  ].join('\n')
}

function buildReduceUser(goal: KbBrainGoal, fragments: MapFragment[]): string {
  const lines = fragments.map((f) => `- [${f.chapter}] ${f.info}${f.note ? `（${f.note}）` : ''}`)
  return [
    `【提炼目标】${goal.name}`,
    goal.hint,
    '',
    '以下是从全书各章提取的相关素材（方括号内是出处）。据此写一份可直接指导创作的经验文档，输出 JSON：',
    '{"title":"论断式标题（含目标维度名）","description":"何时用我（第三人称，≤200字，含触发场景）","body":"markdown 正文"}',
    '正文要求：',
    '1) 按提炼目标 hint 指定的结构分小节组织；',
    '2) 每条经验/结论后标注出处（如 [《书名》#12 章节]），多章印证的列多个；',
    '3) 提炼可复用的模式与规则，不复述剧情；',
    '4) 素材不足的部分明确写「素材不足，待补充」，禁止编造。',
    '',
    '【素材】',
    ...lines,
  ].join('\n')
}
