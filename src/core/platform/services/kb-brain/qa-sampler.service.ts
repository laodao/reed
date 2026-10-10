/**
 * 抽样质检（v2 P4）：judge 评分 → 滚动均 → 质量门 + 分布漂移监控
 * @module platform/services/kb-brain/qa-sampler.service
 *
 * 质量门（回接 A3 的收紧通道）：近 N 次抽检均分 < 1.0 → 冶炼产物降级
 * 「待审」（proposed）而非直发 published；恢复 ≥1.0 自动回到直发。
 * 漂移监控：场面类型分布单一化（某类型占比 >80% 且总量 ≥50）→ 告警日志
 * （「又全塌向一类」的病灶探测器）。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbNoteRepository, KbNoteRecord } from '@core/database/repositories/kb-note.repository'
import type { KbQaLogRepository } from '@core/database/repositories/kb-qa-log.repository'
import type { KbEventRepository } from '@core/database/repositories/kb-event.repository'
import type { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import type { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { QA_JUDGE_SYSTEM, buildQaJudgeUser } from './prompts'
import { parseQaJudgeOutput } from './schemas'
import { parseBrainConfig } from './brain-config'
import { defaultBrainLlm, parseModelRef, type BrainLlmFn, type BrainModelRef } from './llm'

const logger = createLogger('KbQaSampler')

/** 每轮抽检张数与滚动窗口 */
const SAMPLE_N = 5
const ROLLING_WINDOW = 10
/** 降级阈值：滚动均低于此分 → 冶炼产物进待审 */
export const QA_REVIEW_THRESHOLD = 1.0
/** 漂移判定：单一类型占比与总量下限 */
const DRIFT_RATIO = 0.8
const DRIFT_MIN_TOTAL = 50
/**
 * judge 输出预算（2026-10 M0-#5）：500 曾是推理型模型的死穴——思考就把它耗尽，
 * 输出恒空 → 解析恒败 → 滚动均恒空 → 质量门失明。defaultBrainLlm 的空输出翻倍
 * 只对「完全空」触发，这里直接给足常态预算。
 */
export const QA_JUDGE_MAX_TOKENS = 2000

interface QaRepos {
  notes: KbNoteRepository
  qaLogs: KbQaLogRepository
  events: KbEventRepository
  passes: KbDigestPassRepository
  /** 每库模型解析用（可缺省——旧测试桩/极端装配下回落 env/宿主模型链） */
  kbs?: Pick<KnowledgeBaseRepository, 'findById'> | null
}

export interface QaSampleOutcome {
  sampled: number
  avg: number | null
  gate: 'publish' | 'review'
  /** 漂移告警（有则非空） */
  drift?: string
}

export interface QaSamplerDeps {
  llm?: BrainLlmFn
  /** 每库模型工厂（生产缺省 defaultBrainLlm；测试注入捕获解析结果） */
  llmFactory?: (ref: BrainModelRef) => BrainLlmFn
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  repos?: () => QaRepos | null
}

export class KbQaSamplerService {
  private readonly llm: BrainLlmFn
  private readonly depsLlm: BrainLlmFn | null
  private readonly llmFactory: (ref: BrainModelRef) => BrainLlmFn
  private readonly reposFn: () => QaRepos | null
  private readonly running = new Set<string>()

  constructor(deps: QaSamplerDeps = {}) {
    this.depsLlm = deps.llm ?? null
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate', deps.modelOverride)
    this.llmFactory = deps.llmFactory ?? ((ref) => defaultBrainLlm('kb-brain-adjudicate', () => ref))
    this.reposFn =
      deps.repos ??
      ((): QaRepos | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbNotes || !db.kbQaLogs || !db.kbEvents || !db.kbDigestPasses) return null
        return {
          notes: db.kbNotes,
          qaLogs: db.kbQaLogs,
          events: db.kbEvents,
          passes: db.kbDigestPasses,
          kbs: db.knowledgeBases ?? null,
        }
      })
  }

  /**
   * 本轮 judge 用的 LLM（M0-#5 每库模型）：库配置了 models.adjudicate 就按它跑，
   * 缺省回落构造链（env KB_ADJUDICATE_MODEL → 宿主模型）。显式注入的 llm（测试/
   * 定制装配）优先级最高，行为不变。
   */
  private async llmFor(kbId: string): Promise<BrainLlmFn> {
    if (this.depsLlm) return this.depsLlm
    try {
      const repos = this.reposFn()
      const kb = repos?.kbs ? await repos.kbs.findById(kbId) : null
      const cfg = kb ? parseBrainConfig(kb.brainConfig ?? null) : null
      const ref = cfg?.models.adjudicate ? parseModelRef(cfg.models.adjudicate) : {}
      if (ref.modelId || ref.providerConfigId) return this.llmFactory(ref)
    } catch {
      /* 每库解析失败回落默认链路 */
    }
    return this.llm
  }

  isRunning(kbId: string): boolean {
    return this.running.has(kbId)
  }

  /** 质量门（无分/样本不足=直发；滚动均低于阈值=待审） */
  async gateOf(kbId: string): Promise<'publish' | 'review'> {
    const repos = this.reposFn()
    if (!repos) return 'publish'
    const scores = await repos.qaLogs.recentScores(kbId, ROLLING_WINDOW)
    if (scores.length < 3) return 'publish'
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    return avg < QA_REVIEW_THRESHOLD ? 'review' : 'publish'
  }

  /** 抽检一轮：judge 最近冶炼卡 → 记分 → 算门 → 查漂移 */
  async sample(kbId: string): Promise<QaSampleOutcome> {
    if (this.running.has(kbId)) return { sampled: 0, avg: null, gate: await this.gateOf(kbId) }
    const repos = this.reposFn()
    if (!repos) return { sampled: 0, avg: null, gate: 'publish' }
    this.running.add(kbId)
    try {
      // 抽样对象：已发布 + 待审的冶炼卡（smelt 标签）。待审卡必须进样本——
      // review 模式下新卡全是 proposed，只抽 published 会让滚动窗永远收不到新分，
      // 质量门降级后无法恢复（恢复路径依赖对待审卡的评分回升）
      const [pub, prop] = await Promise.all([
        repos.notes.listByStatus(kbId, 'published', 1, 30),
        repos.notes.listByStatus(kbId, 'proposed', 1, 30),
      ])
      const smeltCards = [...pub.rows, ...prop.rows].filter((r) => isSmeltCard(r)).slice(0, SAMPLE_N)
      const llm = await this.llmFor(kbId)
      let llmCalls = 0
      if (smeltCards.length > 0) {
        const rowsToInsert: Array<{ kbId: string; noteId: string; score: number; reason: string }> = []
        for (const card of smeltCards) {
          try {
            const raw = await llm({
              system: QA_JUDGE_SYSTEM,
              user: buildQaJudgeUser({ title: card.title, description: card.description, bodyExcerpt: card.body.slice(0, 600) }),
              maxTokens: QA_JUDGE_MAX_TOKENS,
            })
            const verdict = parseQaJudgeOutput(extractJsonFromResponse(raw))
            rowsToInsert.push({ kbId, noteId: card.id, score: verdict.score, reason: verdict.reason })
            llmCalls += 1
          } catch {
            /* 单卡评分失败跳过（下轮再抽） */
          }
        }
        await repos.qaLogs.insertBatch(rowsToInsert)
      }

      const scores = await repos.qaLogs.recentScores(kbId, ROLLING_WINDOW)
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
      const gate: 'publish' | 'review' = scores.length >= 3 && avg !== null && avg < QA_REVIEW_THRESHOLD ? 'review' : 'publish'
      const drift = await this.checkDrift(repos, kbId)

      if (llmCalls > 0) {
        await repos.passes.recordCompletedPass({
          knowledgeBaseId: kbId,
          documentId: kbId,
          passType: 'smelt',
          passKey: `smelt:qa:${Date.now()}`,
          stats: { sampled: smeltCards.length, avg: Number((avg ?? 0).toFixed(2)) },
          cost: { calls: llmCalls, tokensIn: 0, tokensOut: 0 },
        })
      }
      if (gate === 'review') {
        logger.warn(`[kb-qa] kb=${kbId} 质量门降级：近 ${scores.length} 次抽检均分 ${avg?.toFixed(2)} < ${QA_REVIEW_THRESHOLD}，冶炼产物改走待审`)
      }
      return { sampled: smeltCards.length, avg, gate, drift }
    } finally {
      this.running.delete(kbId)
    }
  }

  /** 类型分布漂移：单一场面类型占比 >80% 且总量 ≥50 → 告警（提取塌向一类的病灶） */
  private async checkDrift(repos: QaRepos, kbId: string): Promise<string | undefined> {
    try {
      const stats = await repos.events.statsBySceneType(kbId)
      const total = Object.values(stats).reduce((a, b) => a + b, 0)
      if (total < DRIFT_MIN_TOTAL) return undefined
      const top = Object.entries(stats).sort((a, b) => b[1] - a[1])[0]
      if (top && top[1] / total > DRIFT_RATIO) {
        const msg = `场面类型分布漂移：${top[0]} 占 ${(100 * (top[1] / total)).toFixed(0)}%（${top[1]}/${total}）——提取可能塌向单一类型，检查 sceneType 枚举/提示词`
        logger.warn(`[kb-qa] kb=${kbId} ${msg}`)
        return msg
      }
    } catch {
      /* 漂移检查失败不影响抽检 */
    }
    return undefined
  }
}

function isSmeltCard(note: KbNoteRecord): boolean {
  try {
    return (JSON.parse(note.tags) as string[]).includes('smelt')
  } catch {
    return false
  }
}

let singleton: KbQaSamplerService | null = null

export function getKbQaSamplerService(): KbQaSamplerService {
  if (!singleton) singleton = new KbQaSamplerService()
  return singleton
}
