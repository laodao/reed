/**
 * 存量论断重判（v3 M1）：提取判据换血（换书测试）前的存量论断，按三档处置——
 * - knowledge=写作知识（保留；可顺带重分层 setting/describe/craft/detail）
 * - evidence=书内事实/剧情（降证据角色：保留检索锚点与溯源资格，不进知识供给）
 * - junk=纯剧情复述/元描述垃圾（归档，可查回不物理删）
 *
 * 与 layer-relabel 的分工：relabel 只管四层归属；rejudge 管「是不是知识」。
 * 选择集：工作集（supported/suspected）+ ai 来源 + 公共层 + role=knowledge——
 * evidence/归档天然退出选择集；留存 knowledge 会被重确认（与 relabel「无法区分
 * 从未标注与标注即 detail」同一取舍），自动化按增长门槛门控避免空转。
 * 编排：分批 map，单批失败跳过；进度供前端/自动化读取（与 relabel 同款动线）。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { KbAtomRepository, KbAtomRecord } from '@core/database/repositories/kb-atom.repository'
import type { KbAtomLayer, KbAtomRole } from '@core/database/entities/kb-brain/kb-atom.entity'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import {
  createKbScopedLlm,
  BRAIN_LLM_MAX_TOKENS,
  type BrainLlmFn,
  type BrainModelRef,
  type KbScopedLlm
} from './llm'
import { REJUDGE_SYSTEM, buildRejudgeUser } from './prompts'

/** 单批论断数：与 relabel/cleanup 同量级 */
const BATCH_SIZE = 60

const VALID_LAYERS: ReadonlySet<string> = new Set(['setting', 'describe', 'craft', 'detail'])
const VALID_VERDICTS: ReadonlySet<string> = new Set(['knowledge', 'evidence', 'junk'])

export interface RejudgeProgress {
  running: boolean
  totalBatches: number
  processedBatches: number
  knowledgeCount: number
  evidenceCount: number
  junkCount: number
  failedBatches: number
  lastError?: string
}

export interface RejudgeDeps {
  llm?: BrainLlmFn
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  atoms?: KbAtomRepository
}

const EMPTY_PROGRESS: RejudgeProgress = {
  running: false,
  totalBatches: 0,
  processedBatches: 0,
  knowledgeCount: 0,
  evidenceCount: 0,
  junkCount: 0,
  failedBatches: 0
}

export class KbRejudgeService {
  private readonly scoped: KbScopedLlm
  private readonly atomsFn: NonNullable<RejudgeDeps['atoms']> | undefined
  private readonly running = new Set<string>()
  private readonly progress = new Map<string, RejudgeProgress>()

  constructor(deps: RejudgeDeps = {}) {
    // 模型解析按 kbId 隔离（review M7 同款：单例并发跑多库不互踩）
    this.scoped = createKbScopedLlm('kb-brain-adjudicate', {
      injected: deps.llm,
      fallback: deps.modelOverride
    })
    this.atomsFn = deps.atoms
  }

  /** 注入每库模型解析（run 前按 kbId 调用；llm 为注入型时无效） */
  setModelOverride(kbId: string, fn: () => BrainModelRef): void {
    this.scoped.setOverride(kbId, fn)
  }

  private llmFor(kbId: string): BrainLlmFn {
    return this.scoped.llmFor(kbId)
  }

  isRunning(kbId: string): boolean {
    return this.running.has(kbId)
  }

  status(kbId: string): RejudgeProgress {
    return this.progress.get(kbId) ?? EMPTY_PROGRESS
  }

  async run(kbId: string): Promise<RejudgeProgress> {
    if (this.running.has(kbId)) throw new Error('存量重判进行中，请稍候')
    const atoms = this.atomsFn ?? getCoreDatabaseManager().kbAtoms ?? undefined
    if (!atoms) throw new Error('知识大脑未启用（旧库）')
    this.running.add(kbId)
    const progress: RejudgeProgress = { ...EMPTY_PROGRESS, running: true }
    this.progress.set(kbId, progress)
    try {
      const all = await atoms.findByKb(kbId, {
        status: ['supported', 'suspected'],
        role: 'knowledge',
        origin: 'ai',
        limit: 5000
      })
      const base = all.filter(a => !a.lensNoteId)
      const batches: KbAtomRecord[][] = []
      for (let i = 0; i < base.length; i += BATCH_SIZE) batches.push(base.slice(i, i + BATCH_SIZE))
      progress.totalBatches = batches.length
      for (const batch of batches) {
        try {
          const r = await this.runBatch(kbId, atoms, batch)
          progress.knowledgeCount += r.knowledge
          progress.evidenceCount += r.evidence
          progress.junkCount += r.junk
        } catch (e) {
          progress.failedBatches += 1
          progress.lastError = e instanceof Error ? e.message : String(e)
        }
        progress.processedBatches += 1
      }
      return progress
    } catch (e) {
      progress.lastError = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      progress.running = false
      this.running.delete(kbId)
    }
  }

  /** 单批：LLM 三档判定 → 分组落库（改写前重查，已被归档/替代的跳过） */
  private async runBatch(
    kbId: string,
    atoms: KbAtomRepository,
    batch: KbAtomRecord[]
  ): Promise<{ knowledge: number; evidence: number; junk: number }> {
    const raw = await this.llmFor(kbId)({
      system: REJUDGE_SYSTEM,
      user: buildRejudgeUser({
        items: batch.map((a, i) => ({ idx: i, type: a.type, layer: a.layer, statement: a.statement }))
      }),
      maxTokens: BRAIN_LLM_MAX_TOKENS
    })
    const verdicts = parseRejudgeOutput(raw, batch)
    if (verdicts.length === 0) return { knowledge: 0, evidence: 0, junk: 0 }
    // 并发守卫：快照改写前重查——已被归档/替代的跳过
    const fresh = await atoms.findByIds(verdicts.map(v => v.id))
    const freshOk = new Set(fresh.map(f => f.id))

    let knowledge = 0
    let evidence = 0
    let junk = 0
    const layerGroups = new Map<KbAtomLayer, string[]>()
    const roleGroups = new Map<KbAtomRole, string[]>()
    for (const v of verdicts) {
      if (!freshOk.has(v.id)) continue
      if (v.verdict === 'junk') {
        await atoms.updateStatus(v.id, { status: 'archived' })
        junk += 1
        continue
      }
      if (v.verdict === 'evidence') {
        const arr = roleGroups.get('evidence') ?? []
        arr.push(v.id)
        roleGroups.set('evidence', arr)
        evidence += 1
        continue
      }
      // knowledge：role 不变（已是 knowledge）；layer 可顺带修正
      knowledge += 1
      if (v.layer && v.layer !== 'detail') {
        const arr = layerGroups.get(v.layer) ?? []
        arr.push(v.id)
        layerGroups.set(v.layer, arr)
      }
    }
    for (const [layer, ids] of layerGroups) await atoms.updateLayers([{ layer, ids }])
    for (const [role, ids] of roleGroups) await atoms.updateRoles([{ role, ids }])
    return { knowledge, evidence, junk }
  }
}

export interface RejudgeVerdict {
  id: string
  verdict: 'knowledge' | 'evidence' | 'junk'
  layer?: KbAtomLayer
}

/** 解析重判输出：{items:[{idx,verdict,layer?}]}——编号收编/去重/越界与非法值过滤；解析失败抛错交单批 catch */
export function parseRejudgeOutput(
  raw: string,
  batch: Array<{ id: string }>
): RejudgeVerdict[] {
  const parsed = extractJsonFromResponse(raw) as Partial<{ items: unknown }> | null
  const arr = Array.isArray(parsed?.items) ? (parsed!.items as unknown[]) : []
  const seen = new Set<number>()
  const out: RejudgeVerdict[] = []
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue
    const idx = Number((item as { idx?: unknown }).idx)
    const verdict = (item as { verdict?: unknown }).verdict
    const layer = (item as { layer?: unknown }).layer
    if (!Number.isInteger(idx) || idx < 0 || idx >= batch.length || seen.has(idx)) continue
    if (typeof verdict !== 'string' || !VALID_VERDICTS.has(verdict)) continue
    seen.add(idx)
    out.push({
      id: batch[idx]!.id,
      verdict: verdict as RejudgeVerdict['verdict'],
      layer: typeof layer === 'string' && VALID_LAYERS.has(layer) ? (layer as KbAtomLayer) : undefined
    })
  }
  return out
}

let singleton: KbRejudgeService | null = null

export function getKbRejudgeService(): KbRejudgeService {
  if (!singleton) singleton = new KbRejudgeService()
  return singleton
}
