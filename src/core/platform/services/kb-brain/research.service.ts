/**
 * 知识大脑·深度研究流（M4 capstone，详细设计 §7.3）
 * @module platform/services/kb-brain/research.service
 *
 * 四阶段服务级编排（Deep Research 综述蓝图）：
 *   规划 → LLM 分解研究问题为 3-5 个子问题（MemoRAG 式草稿线索先行）
 *   探索 → 每个子问题独立 brain 检索（统一池 synthesize）→ LLM 消化为要点笔记
 *   综合 → 跨笔记综合：惯例（高频共现）/ 分歧（refutes 边与对立表述）/ 荒地（低频组合）
 *   回写 → 综合报告卡（synthesis, proposed）+ 悬而未决转 open-question 论断——增量学习闭环
 * 过程可见：kb:brain:research 事件逐阶段推送；工具循环 agent 化随宿主接线升级（登记）。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { defaultBrainLlm, type BrainLlmFn } from './llm'
import { BrainQueryService } from './brain-query.service'
import { createDefaultBrainQuery } from './brain-provider'
import { parseBrainConfig } from './brain-config'

const logger = createLogger('KbBrainResearch')

export const RESEARCH_EVENTS = {
  PROGRESS: 'kb:brain:research',
} as const

export interface ResearchReport {
  question: string
  subQuestions: string[]
  notes: Array<{ subQuestion: string; hits: number; digest: string }>
  conventions: string[]
  divergences: string[]
  gaps: string[]
  openQuestions: string[]
  reportMd: string
  reportCardId: string | null
}

export interface ResearchDeps {
  llm?: BrainLlmFn
  brainQuery?: BrainQueryService
  /** 解析研究目标库（生产=第一个启用大脑的库；测试注入） */
  resolveKb?: () => Promise<{ id: string; embeddingConfig: string | null } | null>
}

export class KbResearchService {
  private readonly llm: BrainLlmFn
  private readonly brainQueryFn: () => BrainQueryService | null
  private readonly resolveKbFn: NonNullable<ResearchDeps['resolveKb']>

  constructor(deps: ResearchDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate')
    this.brainQueryFn = deps.brainQuery ? () => deps.brainQuery! : () => createDefaultBrainQuery()
    this.resolveKbFn =
      deps.resolveKb ??
      (async () => {
        const db = getCoreDatabaseManager()
        const all = await db.knowledgeBases?.findAll()
        if (!all) return null
        for (const kb of all) {
          try {
            if (parseBrainConfig(kb.brainConfig)?.enabled) {
              return { id: kb.id, embeddingConfig: kb.embeddingConfig ?? null }
            }
          } catch {
            continue // 损坏配置视为未启用
          }
        }
        return null
      })
  }

  async research(question: string): Promise<ResearchReport> {
    const kb = await this.resolveKbFn()
    if (!kb) throw new Error('没有启用知识大脑的库（先在面板开启大脑）')
    const brainQuery = this.brainQueryFn()
    if (!brainQuery) throw new Error('知识大脑仓储未装配')

    const report: ResearchReport = {
      question,
      subQuestions: [],
      notes: [],
      conventions: [],
      divergences: [],
      gaps: [],
      openQuestions: [],
      reportMd: '',
      reportCardId: null,
    }

    /* ---------- 阶段 1：规划（分解子问题） ---------- */
    this.emit('plan', '分解研究问题…')
    let subQuestions: string[] = []
    try {
      const planRaw = await this.llm({
        system:
          '你是研究规划员。把研究问题分解为 3-5 个可独立检索的子问题。只输出 JSON：{ "subQuestions": ["..."] }',
        user: question,
        maxTokens: 1500,
      })
      const parsed = extractJsonFromResponse(planRaw) as { subQuestions?: unknown }
      subQuestions = Array.isArray(parsed.subQuestions)
        ? parsed.subQuestions.map(String).filter((s) => s.trim()).slice(0, 5)
        : []
    } catch {
      subQuestions = [] // LLM 失败与解析失败同降级：单问题直查
    }
    if (subQuestions.length === 0) subQuestions = [question]
    report.subQuestions = subQuestions

    /* ---------- 阶段 2：探索（逐子问题检索+消化） ---------- */
    const allStatements: string[] = []
    const atomIds: string[] = []
    for (let i = 0; i < subQuestions.length; i++) {
      const subQ = subQuestions[i]
      this.emit('explore', `(${i + 1}/${subQuestions.length}) ${subQ}`)
      let hits: Array<{ content: string; from: string }> = []
      try {
        const res = await brainQuery.search({
          knowledgeBaseId: kb.id,
          query: subQ,
          topK: 6,
          include: ['atom', 'note'],
          intent: 'synthesize',
          embeddingConfig: kb.embeddingConfig,
        })
        if (res.success && res.data) {
          hits = res.data.map((r) => ({ content: r.content, from: r.documentName }))
          for (const r of res.data) {
            if (r.kind === 'atom' && r.atom) atomIds.push(r.atom.id)
          }
        }
      } catch (e) {
        logger.warn(`[kb-research] 子问题检索失败: ${e instanceof Error ? e.message : String(e)}`)
      }
      if (hits.length === 0) {
        report.notes.push({ subQuestion: subQ, hits: 0, digest: '（库内无相关材料）' })
        continue
      }
      allStatements.push(...hits.map((h) => h.content))
      let digest = ''
      try {
        digest = (
          await this.llm({
            system: '你是研究员。用 3-5 条要点提炼给定材料对该子问题的回答，每条一句话。只输出要点列表（markdown 列表）。',
            user: `子问题：${subQ}\n材料：\n${hits.map((h) => `- （${h.from}）${h.content}`).join('\n')}`,
            maxTokens: 1500,
          })
        ).trim()
      } catch {
        digest = hits.map((h) => `- ${h.content}`).join('\n') // LLM 失败降级为原始材料
      }
      report.notes.push({ subQuestion: subQ, hits: hits.length, digest })
    }

    /* ---------- 阶段 3：综合 ---------- */
    this.emit('synthesize', '跨笔记综合成报…')
    const notesMd = report.notes.map((n) => `## ${n.subQuestion}\n${n.digest}`).join('\n\n')
    try {
      // LLM 调用与解析同一保护域（盲审 P1：调用 throw 曾穿透降级路径，整场研究白费）
      const synRaw = await this.llm({
        system:
          '你是首席研究员。综合多份研究笔记为一份深度报告（markdown），并抽取：' +
          'conventions=类型惯例（材料中反复出现的做法）、divergences=真实分歧（材料中互相矛盾的点）、' +
          'gaps=荒地（材料中没人做过/没覆盖的方向）、openQuestions=值得后续追查的悬置问题（数组，每条转成 open-question 论断句）。\n' +
          '只输出 JSON：{ "reportMd": "...", "conventions": [], "divergences": [], "gaps": [], "openQuestions": [] }',
        user: `研究问题：${question}\n\n研究笔记：\n${notesMd}`,
        maxTokens: 6000,
      })
      const parsed = extractJsonFromResponse(synRaw) as Partial<ResearchReport>
      report.reportMd = String(parsed.reportMd ?? '')
      report.conventions = (parsed.conventions ?? []).map(String)
      report.divergences = (parsed.divergences ?? []).map(String)
      report.gaps = (parsed.gaps ?? []).map(String)
      report.openQuestions = (parsed.openQuestions ?? []).map(String).slice(0, 8)
    } catch (e) {
      // 综合（调用或解析）失败降级：报告=笔记拼接
      logger.warn(`[kb-research] 综合失败（降级笔记拼接）: ${e instanceof Error ? e.message : String(e)}`)
      report.reportMd = notesMd
    }

    /* ---------- 阶段 4：回写（增量学习闭环） ---------- */
    this.emit('writeback', '产物回写（报告卡 + 悬置问题）…')
    const db = getCoreDatabaseManager()
    if (db.kbNotes && db.kbAtoms) {
      try {
      const card = await db.kbNotes.propose(kb.id, {
        title: `研究：${question.slice(0, 48)}`,
        description: `深度研究报告。当你需要围绕「${question.slice(0, 24)}」做创作决策时使用；含惯例/分歧/荒地三视图。`,
        body: report.reportMd,
        type: 'synthesis',
        evidence: JSON.stringify([...new Set(atomIds)].slice(0, 20).map((id) => ({ atomId: id }))),
        origin: 'ai-distill',
        tags: JSON.stringify(['research']),
      })
      report.reportCardId = card.id
      // 悬置点 → open-question 论断（创作与后续深挖的钩子；statement 前缀查重防重复研究堆积）
      if (report.openQuestions.length > 0) {
        const existing = await db.kbAtoms.findByKb(kb.id, { limit: 500 })
        const seenPrefix = new Set(existing.map((a) => a.statement.slice(0, 24)))
        const fresh = report.openQuestions.filter((q) => !seenPrefix.has(q.slice(0, 24)))
        if (fresh.length > 0) {
          await db.kbAtoms.createBatch(
            fresh.slice(0, 6).map((q) => ({
              knowledgeBaseId: kb.id,
              statement: q,
              type: 'open-question' as const,
              certainty: 0.5,
              sourceDocumentId: kb.id, // 研究产物无单一文档出处——挂库级（浏览仅在库级列表可见，登记）
              sourceQuote: `深度研究：${question.slice(0, 80)}`,
              extractionPass: 'research#1',
              origin: 'ai' as const,
            })),
          )
        }
      }
      } catch (e) {
        // 回写失败不丢弃报告（盲审 P1：报告已完整生成时，卡入队失败也应把报告交到用户手上）
        logger.warn(`[kb-research] 产物回写失败（仅返回报告）: ${e instanceof Error ? e.message : String(e)}`)
        report.reportCardId = null
        this.emit('writeback', '产物回写失败，仅返回报告')
      }
    }

    this.emit('done', `研究完成：${report.subQuestions.length} 个子问题，报告卡已入提议队列`)
    return report
  }

  private emit(phase: string, detail: string): void {
    try {
      getEventEmitter().emit(RESEARCH_EVENTS.PROGRESS, { phase, detail })
    } catch {
      /* 事件失败不影响主流程 */
    }
  }
}
