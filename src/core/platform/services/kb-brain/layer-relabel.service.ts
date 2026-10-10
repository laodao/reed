/**
 * 存量论断分层补标（layer relabel）：分层标注上线前入库的老论断 layer 恒为
 * detail——分层筛选、体检分层统计、书级设定索引/知识体系图取材全部落空。
 * 本服务对工作集 detail 论断分批 LLM 重标（setting/describe/craft/detail）。
 *
 * - 输入：工作集（supported/suspected/stale）、ai 来源、公共层、当前 layer=detail
 *   （human 观感/视角论断不动；已正确标 detail 的论断会被重标确认——无历史标记
 *   可区分「从未标注」与「标注即 detail」，多花一次确认调用换逻辑简单幂等）
 * - 产出：layer 字段就地改写（不碰状态机，可重复跑）
 * - 编排：分批 map，单批失败跳过；进度供前端轮询（与 cleanup/consolidate 同款动线）
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { KbAtomRepository, KbAtomRecord } from '@core/database/repositories/kb-atom.repository'
import type { KbAtomLayer } from '@core/database/entities/kb-brain/kb-atom.entity'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import {
  createKbScopedLlm,
  BRAIN_LLM_MAX_TOKENS,
  type BrainLlmFn,
  type BrainModelRef,
  type KbScopedLlm
} from './llm'
import { LAYER_RELABEL_SYSTEM, buildLayerRelabelUser } from './prompts'

/** 单批论断数：与 cleanup/consolidate 同量级 */
const BATCH_SIZE = 60

const VALID_LAYERS: ReadonlySet<string> = new Set(['setting', 'describe', 'craft', 'detail'])

export interface LayerRelabelProgress {
  running: boolean
  totalBatches: number
  processedBatches: number
  relabeledCount: number
  failedBatches: number
  lastError?: string
}

export interface LayerRelabelDeps {
  llm?: BrainLlmFn
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  atoms?: KbAtomRepository
}

const EMPTY_PROGRESS: LayerRelabelProgress = {
  running: false,
  totalBatches: 0,
  processedBatches: 0,
  relabeledCount: 0,
  failedBatches: 0
}

export class KbLayerRelabelService {
  private readonly scoped: KbScopedLlm
  private readonly atomsFn: NonNullable<LayerRelabelDeps['atoms']> | undefined
  private readonly running = new Set<string>()
  private readonly progress = new Map<string, LayerRelabelProgress>()

  constructor(deps: LayerRelabelDeps = {}) {
    // 模型解析按 kbId 隔离（review M7：单例并发跑多库不互踩）
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

  status(kbId: string): LayerRelabelProgress {
    return this.progress.get(kbId) ?? EMPTY_PROGRESS
  }

  async run(kbId: string): Promise<LayerRelabelProgress> {
    if (this.running.has(kbId)) throw new Error('分层补标进行中，请稍候')
    const atoms = this.atomsFn ?? getCoreDatabaseManager().kbAtoms ?? undefined
    if (!atoms) throw new Error('知识大脑未启用（旧库）')
    this.running.add(kbId)
    const progress: LayerRelabelProgress = { ...EMPTY_PROGRESS, running: true }
    this.progress.set(kbId, progress)
    try {
      const all = await atoms.findByKb(kbId, {
        status: ['supported', 'suspected', 'stale'],
        limit: 5000
      })
      const base = all.filter(a => a.layer === 'detail' && !a.lensNoteId && a.origin !== 'human')
      const batches: KbAtomRecord[][] = []
      for (let i = 0; i < base.length; i += BATCH_SIZE) batches.push(base.slice(i, i + BATCH_SIZE))
      progress.totalBatches = batches.length
      for (const batch of batches) {
        try {
          progress.relabeledCount += await this.runBatch(kbId, atoms, batch)
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

  /** 单批：LLM 分层 → 按层分组改写。改写前按 id 重查（并发守卫），已不在库的跳过 */
  private async runBatch(
    kbId: string,
    atoms: KbAtomRepository,
    batch: KbAtomRecord[]
  ): Promise<number> {
    const raw = await this.llmFor(kbId)({
      system: LAYER_RELABEL_SYSTEM,
      user: buildLayerRelabelUser({
        items: batch.map((a, i) => ({ idx: i, type: a.type, statement: a.statement }))
      }),
      // 8000：推理型模型思考计入输出预算（cleanup 同款真机实证），输出本身很小
      maxTokens: BRAIN_LLM_MAX_TOKENS
    })
    const pairs = parseRelabelOutput(raw, batch)
    if (pairs.length === 0) return 0
    // 并发守卫：分层是快照，改写前重查——已被归档/替代的跳过
    const fresh = await atoms.findByIds(pairs.map(p => p.id))
    const freshOk = new Set(fresh.map(f => f.id))
    const byLayer = new Map<KbAtomLayer, string[]>()
    for (const p of pairs) {
      if (!freshOk.has(p.id)) continue
      const arr = byLayer.get(p.layer) ?? []
      arr.push(p.id)
      byLayer.set(p.layer, arr)
    }
    const groups = [...byLayer].map(([layer, ids]) => ({ layer, ids }))
    return groups.length === 0 ? 0 : atoms.updateLayers(groups)
  }
}

/** 解析分层输出：{layers:[{idx,layer}]}——编号收编/去重/越界与非法层过滤；解析失败抛错交单批 catch */
export function parseRelabelOutput(
  raw: string,
  batch: Array<{ id: string }>
): Array<{ id: string; layer: KbAtomLayer }> {
  const parsed = extractJsonFromResponse(raw) as Partial<{ layers: unknown }> | null
  const arr = Array.isArray(parsed?.layers) ? (parsed!.layers as unknown[]) : []
  const seen = new Set<number>()
  const out: Array<{ id: string; layer: KbAtomLayer }> = []
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue
    const idx = Number((item as { idx?: unknown }).idx)
    const layer = (item as { layer?: unknown }).layer
    if (!Number.isInteger(idx) || idx < 0 || idx >= batch.length || seen.has(idx)) continue
    if (typeof layer !== 'string' || !VALID_LAYERS.has(layer)) continue
    seen.add(idx)
    out.push({ id: batch[idx]!.id, layer: layer as KbAtomLayer })
  }
  return out
}

let singleton: KbLayerRelabelService | null = null

export function getKbLayerRelabelService(): KbLayerRelabelService {
  if (!singleton) singleton = new KbLayerRelabelService()
  return singleton
}
