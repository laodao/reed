/**
 * 存量垃圾论断清理（cleanup）：对工作集论断做 LLM 分诊，把确定无疑的垃圾
 * （元描述式/结构性残留/空洞重复）归档。宁漏勿杀——分诊标准只收三类硬垃圾。
 *
 * - 输入：工作集（supported/suspected/stale、公共层），排除 human 观感与视角论断
 * - 产出：junk 条目 status='archived'（可按状态查回，不物理删除）
 * - 编排：分批 map，单批失败跳过；进度供前端轮询（与 consolidate 同款动线）
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import type { KbAtomRecord } from '@core/database/repositories/kb-atom.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { defaultBrainLlm, type BrainLlmFn } from './llm'
import { CLEANUP_SYSTEM } from './prompts'

/** 单批论断数：与 consolidate 同量级（变长论断 ~150 字均值） */
const BATCH_SIZE = 60

export interface CleanupProgress {
  running: boolean
  totalBatches: number
  processedBatches: number
  archivedCount: number
  failedBatches: number
  lastError?: string
}

export interface CleanupDeps {
  llm?: BrainLlmFn
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  atoms?: KbAtomRepository
}

const EMPTY_PROGRESS: CleanupProgress = {
  running: false,
  totalBatches: 0,
  processedBatches: 0,
  archivedCount: 0,
  failedBatches: 0,
}

export class KbCleanupService {
  private readonly llm: BrainLlmFn
  private readonly atomsFn: NonNullable<CleanupDeps['atoms']> | undefined
  private readonly running = new Set<string>()
  private readonly progress = new Map<string, CleanupProgress>()
  /** 每库模型动态解析（handler 在 run 前注入 brainConfig.models.adjudicate） */
  private modelOverrideFn: () => { providerConfigId?: string; modelId?: string } = () => ({})

  constructor(deps: CleanupDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate', deps.modelOverride ?? (() => this.modelOverrideFn()))
    this.atomsFn = deps.atoms
  }

  /** 注入每库模型解析（run 前调用；llm 为注入型时无效） */
  setModelOverride(fn: () => { providerConfigId?: string; modelId?: string }): void {
    this.modelOverrideFn = fn
  }

  isRunning(kbId: string): boolean {
    return this.running.has(kbId)
  }

  status(kbId: string): CleanupProgress {
    return this.progress.get(kbId) ?? EMPTY_PROGRESS
  }

  async run(kbId: string): Promise<CleanupProgress> {
    if (this.running.has(kbId)) throw new Error('垃圾清理进行中，请稍候')
    const atoms = this.atomsFn ?? getCoreDatabaseManager().kbAtoms ?? undefined
    if (!atoms) throw new Error('知识大脑未启用（旧库）')
    this.running.add(kbId)
    const progress: CleanupProgress = { ...EMPTY_PROGRESS, running: true }
    this.progress.set(kbId, progress)
    try {
      // 工作集输入：human 观感/视角论断/归纳产物永不清理（用户信号与新鲜产物排除在外）
      const all = await atoms.findByKb(kbId, { status: ['supported', 'suspected', 'stale'], limit: 5000 })
      const base = all.filter(
        (a) => !a.extractionPass.startsWith('consolidate') && !a.lensNoteId && a.origin !== 'human',
      )
      const batches: KbAtomRecord[][] = []
      for (let i = 0; i < base.length; i += BATCH_SIZE) batches.push(base.slice(i, i + BATCH_SIZE))
      progress.totalBatches = batches.length
      for (const batch of batches) {
        try {
          progress.archivedCount += await this.runBatch(atoms, batch)
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

  /** 单批：LLM 分诊 → junk 归档。归档前按 id 重查（同 consolidate 并发守卫），已被改动的不动 */
  private async runBatch(atoms: KbAtomRepository, batch: KbAtomRecord[]): Promise<number> {
    const raw = await this.llm({
      system: CLEANUP_SYSTEM,
      user: buildTriageUser(batch),
      // 8000：推理型模型（deepseek-v4.1 等）思考内容计入输出预算，2000 会被
      // reasoning 耗尽返回空文本（真机实证 19/20 批 chars=0）——正文 JSON 很小，
      // 余量全给思考
      maxTokens: 8000,
    })
    const junkIdx = this.parseJunkIdx(raw, batch.length)
    if (junkIdx.length === 0) return 0
    const members = junkIdx.map((i) => batch[i]!)
    // 并发守卫：分诊是快照，归档前重查——状态已变更的跳过
    const fresh = await atoms.findByIds(members.map((m) => m.id))
    const freshOk = new Set(fresh.filter((f) => f.status === 'supported' || f.status === 'suspected' || f.status === 'stale').map((f) => f.id))
    let archived = 0
    for (const m of members) {
      if (!freshOk.has(m.id)) continue
      await atoms.updateStatus(m.id, { status: 'archived' })
      archived += 1
    }
    return archived
  }

  /** 解析分诊输出：{junk:[idx]}——编号收编/去重/越界过滤，解析失败抛错交单批 catch */
  private parseJunkIdx(raw: string, count: number): number[] {
    const parsed = extractJsonFromResponse(raw) as Partial<{ junk: unknown }> | null
    const arr = Array.isArray(parsed?.junk) ? (parsed!.junk as unknown[]) : []
    return [...new Set(arr.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < count))]
  }
}

function buildTriageUser(batch: KbAtomRecord[]): string {
  return `GIVEN:\n${batch.map((a, i) => `[${i}] (${a.type}) ${a.statement}`).join('\n')}`
}

let singleton: KbCleanupService | null = null

export function getKbCleanupService(): KbCleanupService {
  if (!singleton) singleton = new KbCleanupService()
  return singleton
}
