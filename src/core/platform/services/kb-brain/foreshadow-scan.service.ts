/**
 * 知识大脑·伏笔扫描（G3，全局结构设计 §4）
 * @module platform/services/kb-brain/foreshadow-scan.service
 *
 * sets-up 边候选生成器：open-question 论断（悬念=埋设）× 同书后文 fact 论断
 * → 「埋设-回收」边提案（kb_knowledge_edges，relation='sets-up'）。
 * 定位是候选生成器而非自动归纳：verified=0 起步进人审，confidence 压低——
 * 跨距连边错误率天然高，价值在把候选摆到人面前。
 * 仅手动触发（kb:brain:foreshadow-run）；fire-and-forget + 状态轮询，与 cleanup 同动线。
 * P-8 prompt 见 prompts（判例写死「因果相邻=leads-to；呼应不相邻=sets-up」的区分边界）。
 */
import { createLogger } from '@core/utils/logger'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { FORESHADOW_SYSTEM, buildForeshadowUser } from './prompts'
import { defaultBrainLlm, type BrainLlmFn } from './llm'

const logger = createLogger('KbBrainForeshadowScan')

/** 单次扫描处理的文档数上限（LLM 批量调用的成本闸门；超出留待下轮） */
const MAX_DOCS_PER_RUN = 20
/** 单文档回收候选（fact 论断）上限 */
const PAYOFFS_PER_DOC = 60
/** 单次扫描的悬念（open-question）总数上限 */
const MAX_SETUPS = 200

export interface ForeshadowRunStats {
  /** 实际跑了 LLM 扫描的文档数 */
  scannedDocs: number
  /** 参与扫描的悬念论断总数 */
  setups: number
  /** 模型提出的边数（含重复） */
  linksProposed: number
  /** 实际新落库的边数（verified=0，待人审） */
  created: number
  /** 命中唯一键跳过的边数（重复扫描的幂等证明） */
  deduped: number
  /** 因上限/失败跳过的文档数 */
  skippedDocs: number
}

export interface ForeshadowProgress {
  running: boolean
  last?: ForeshadowRunStats & { ok: boolean; error?: string; finishedAt: string }
}

const IDLE: ForeshadowProgress = { running: false }

export class KbForeshadowScanService {
  private readonly llm: BrainLlmFn
  private readonly running = new Set<string>()
  private readonly progress = new Map<string, ForeshadowProgress>()

  constructor(deps?: { llm?: BrainLlmFn; modelOverride?: () => { providerConfigId?: string; modelId?: string } }) {
    this.llm = deps?.llm ?? defaultBrainLlm('kb-brain-adjudicate', deps?.modelOverride) // 跨距判读走高档
  }

  isRunning(kbId: string): boolean {
    return this.running.has(kbId)
  }

  status(kbId: string): ForeshadowProgress {
    return this.progress.get(kbId) ?? IDLE
  }

  async run(kbId: string): Promise<ForeshadowRunStats> {
    if (this.running.has(kbId)) throw new Error('伏笔扫描进行中，请稍候')
    this.running.add(kbId)
    this.progress.set(kbId, { running: true })
    try {
      const stats = await this.doRun(kbId)
      this.progress.set(kbId, { running: false, last: { ...stats, ok: true, finishedAt: new Date().toISOString() } })
      return stats
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.progress.set(kbId, {
        running: false,
        last: {
          scannedDocs: 0, setups: 0, linksProposed: 0, created: 0, deduped: 0, skippedDocs: 0,
          ok: false, error: msg, finishedAt: new Date().toISOString(),
        },
      })
      throw e
    } finally {
      this.running.delete(kbId)
    }
  }

  private async doRun(kbId: string): Promise<ForeshadowRunStats> {
    const db = getCoreDatabaseManager()
    if (!db.kbAtoms || !db.kbKnowledgeEdges) throw new Error('知识大脑未启用（旧库）')
    const stats: ForeshadowRunStats = { scannedDocs: 0, setups: 0, linksProposed: 0, created: 0, deduped: 0, skippedDocs: 0 }

    // 1. 悬念池：open-question 工作集论断（伏笔候选的前置形态）
    const setups = await db.kbAtoms.findByKb(kbId, { type: 'open-question', status: ['supported'], limit: MAX_SETUPS })
    stats.setups = setups.length
    if (setups.length === 0) return stats

    // 2. 按文档分组（回收必然同书——跨书的呼应属另册，不在此扫描）
    const byDoc = new Map<string, typeof setups>()
    for (const s of setups) {
      if (!byDoc.has(s.sourceDocumentId)) byDoc.set(s.sourceDocumentId, [])
      byDoc.get(s.sourceDocumentId)!.push(s)
    }

    // 3. 逐文档：悬念 × 同书 fact 候选 → P-8 判读 → 落边（唯一键幂等）
    let docCount = 0
    for (const [docId, docSetups] of byDoc) {
      if (docCount >= MAX_DOCS_PER_RUN) {
        stats.skippedDocs++
        continue
      }
      docCount++
      const payoffs = (await db.kbAtoms.findByDocument(docId, { status: ['supported'], lensNoteId: null }))
        .filter((a) => a.type === 'fact' && !docSetups.some((s) => s.id === a.id))
        .slice(0, PAYOFFS_PER_DOC)
      if (payoffs.length === 0) continue

      let parsed: Partial<{ links: Array<{ setup: unknown; payoff: unknown; evidence: unknown }> }> | null
      try {
        const raw = await this.llm({
          system: FORESHADOW_SYSTEM,
          user: buildForeshadowUser({
            setups: docSetups.map((s, i) => ({ idx: i, statement: s.statement })),
            payoffs: payoffs.map((p, i) => ({ idx: i, statement: p.statement })),
          }),
          maxTokens: 2000,
        })
        parsed = extractJsonFromResponse(raw) as typeof parsed
      } catch (e) {
        stats.skippedDocs++
        logger.warn(`[kb-brain-foreshadow] kb=${kbId} doc=${docId} 判读失败跳过: ${e instanceof Error ? e.message : String(e)}`)
        continue
      }

      const rows: Array<{
        sourceKind: 'atom'; sourceId: string; relation: 'sets-up'; targetKind: 'atom'; targetId: string
        evidence: string; confidence: number; origin: 'ai'
      }> = []
      const seen = new Set<string>()
      for (const l of parsed?.links ?? []) {
        const si = Number(l?.setup)
        const pi = Number(l?.payoff)
        if (!Number.isInteger(si) || !Number.isInteger(pi)) continue
        const s = docSetups[si]
        const p = payoffs[pi]
        if (!s || !p || s.id === p.id) continue
        const key = `${s.id}->${p.id}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push({
          sourceKind: 'atom',
          sourceId: s.id,
          relation: 'sets-up',
          targetKind: 'atom',
          targetId: p.id,
          evidence: (typeof l?.evidence === 'string' && l.evidence.trim() ? l.evidence : '伏笔回收（P-8 判定）').slice(0, 200),
          confidence: 0.5,
          origin: 'ai',
        })
      }
      if (rows.length === 0) continue
      const res = await db.kbKnowledgeEdges.createBatch(kbId, rows)
      stats.linksProposed += rows.length
      stats.created += res.created
      stats.deduped += res.deduped
      stats.scannedDocs = docCount
    }

    logger.info(
      `[kb-brain-foreshadow] kb=${kbId} 文档=${stats.scannedDocs} 悬念=${stats.setups} 提案=${stats.linksProposed} 新增=${stats.created} 重复=${stats.deduped} 跳过文档=${stats.skippedDocs}`,
    )
    return stats
  }
}

let singleton: KbForeshadowScanService | null = null

export function getKbForeshadowScanService(deps?: {
  llm?: BrainLlmFn
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
}): KbForeshadowScanService {
  if (!singleton) singleton = new KbForeshadowScanService(deps)
  return singleton
}
