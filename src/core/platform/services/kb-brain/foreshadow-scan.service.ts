/**
 * 知识大脑·伏笔扫描（G3，全局结构设计 §4）
 * @module platform/services/kb-brain/foreshadow-scan.service
 *
 * sets-up 边候选生成器：open-question 论断（悬念=埋设）× 同书后文 fact 论断
 * → 「埋设-回收」边提案（kb_knowledge_edges，relation='sets-up'）。
 * 定位是候选生成器而非自动归纳：verified=0 起步进人审，confidence 压低——
 * 跨距连边错误率天然高，价值在把候选摆到人面前。
 * 方向正确性（review P1 修复）：回收候选限同书，且程序侧强制「payoff 章序
 * 严格晚于 setup」——章号随候选传给 P-8 辅助判读，越界连边在落库前丢弃；
 * 双方任一缺章锚（溯源退化）一律不连。
 * 增量语义（review P2 修复）：已有出边 sets-up 的悬念视为已回收，不再进扫描
 * ——与「未回收伏笔」视图同一判定，扫描后悬空集合单调收缩。
 * 仅手动触发（kb:brain:foreshadow-run）；fire-and-forget + 状态轮询，与 cleanup 同动线。
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
  /** 实际跑了 LLM 判读的文档数 */
  scannedDocs: number
  /** 参与判读的悬念论断数（已回收的不在内） */
  setups: number
  /** 通过章序校验、交给落库的边提案数 */
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
    if (!db.kbAtoms || !db.kbKnowledgeEdges || !db.kbChapters) throw new Error('知识大脑未启用（旧库）')
    const stats: ForeshadowRunStats = { scannedDocs: 0, setups: 0, linksProposed: 0, created: 0, deduped: 0, skippedDocs: 0 }

    // 1. 悬念池：open-question 工作集论断（伏笔候选的前置形态）
    const allSetups = await db.kbAtoms.findByKb(kbId, { type: 'open-question', status: ['supported'], limit: MAX_SETUPS })
    // P2：已有出边 sets-up 的悬念视为已回收，不再进扫描（与「未回收伏笔」视图同一判定）
    const linked = await db.kbKnowledgeEdges.neighborsOf(kbId, allSetups.map((s) => s.id))
    const settled = new Set(linked.filter((e) => e.relation === 'sets-up' && e.sourceKind === 'atom').map((e) => e.sourceId))
    const setups = allSetups.filter((s) => !settled.has(s.id))
    stats.setups = setups.length
    if (setups.length === 0) return stats

    // 2. 按文档分组（回收必然同书——跨书的呼应属另册，不在此扫描）
    const byDoc = new Map<string, typeof setups>()
    for (const s of setups) {
      if (!byDoc.has(s.sourceDocumentId)) byDoc.set(s.sourceDocumentId, [])
      byDoc.get(s.sourceDocumentId)!.push(s)
    }

    // 3. 逐文档：章序映射 → 悬念 × 同书后文 fact 候选 → P-8 判读 → 章序复核 → 落边
    let docCount = 0
    for (const [docId, docSetups] of byDoc) {
      if (docCount >= MAX_DOCS_PER_RUN) {
        stats.skippedDocs++
        continue
      }
      docCount++
      // P1：章序（chapters.findByDocument 按 ordering ASC）——缺章锚的论断无法判定先后，宁可漏不掉错
      const chapters = await db.kbChapters.findByDocument(docId)
      const seqByChapter = new Map(chapters.map((c, i) => [c.id, i + 1]))
      const seqOf = (a: { sourceChapterId: string | null }): number | null => {
        if (!a.sourceChapterId) return null
        return seqByChapter.get(a.sourceChapterId) ?? null
      }
      const orderableSetups = docSetups.filter((s) => seqOf(s) !== null)
      if (orderableSetups.length === 0) continue
      const payoffCandidates = (await db.kbAtoms.findByDocument(docId, { status: ['supported'], lensNoteId: null }))
        .filter(
          (a) =>
            a.type === 'fact' &&
            !orderableSetups.some((s) => s.id === a.id) &&
            seqOf(a) !== null,
        )
        .slice(0, PAYOFFS_PER_DOC)
      if (payoffCandidates.length === 0) continue

      let parsed: Partial<{ links: Array<{ setup: unknown; payoff: unknown; evidence: unknown }> }> | null
      try {
        const raw = await this.llm({
          system: FORESHADOW_SYSTEM,
          user: buildForeshadowUser({
            setups: orderableSetups.map((s, i) => ({ idx: i, statement: s.statement, chapterNo: seqOf(s) ?? 0 })),
            payoffs: payoffCandidates.map((p, i) => ({ idx: i, statement: p.statement, chapterNo: seqOf(p) ?? 0 })),
          }),
          maxTokens: 2000,
        })
        parsed = extractJsonFromResponse(raw) as typeof parsed
      } catch (e) {
        stats.skippedDocs++
        logger.warn(`[kb-brain-foreshadow] kb=${kbId} doc=${docId} 判读失败跳过: ${e instanceof Error ? e.message : String(e)}`)
        continue
      }
      stats.scannedDocs++

      const rows: Array<{
        sourceKind: 'atom'; sourceId: string; relation: 'sets-up'; targetKind: 'atom'; targetId: string
        evidence: string; confidence: number; origin: 'ai'
      }> = []
      const seen = new Set<string>()
      let droppedOrder = 0
      for (const l of parsed?.links ?? []) {
        const si = Number(l?.setup)
        const pi = Number(l?.payoff)
        if (!Number.isInteger(si) || !Number.isInteger(pi)) continue
        const s = orderableSetups[si]
        const p = payoffCandidates[pi]
        if (!s || !p || s.id === p.id) continue
        // 程序侧强制方向：回收章序必须严格晚于埋设（prompt 已给章号，这里是最终防线）
        if (!((seqOf(p) ?? 0) > (seqOf(s) ?? 0))) {
          droppedOrder++
          continue
        }
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
      if (droppedOrder > 0) {
        logger.info(`[kb-brain-foreshadow] kb=${kbId} doc=${docId} 章序校验丢弃 ${droppedOrder} 条反向/同章提案`)
      }
      if (rows.length === 0) continue
      const res = await db.kbKnowledgeEdges.createBatch(kbId, rows)
      stats.linksProposed += rows.length
      stats.created += res.created
      stats.deduped += res.deduped
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
