/**
 * 论断归纳整理（consolidate）：对已入库论断做二次提炼，把细碎堆叠的碎片合并成综合论断。
 *
 * - 输入：库内 working set（supported/suspected、公共层 lensNoteId=null、视角/人类观感不参与），
 *   排除 consolidate 产物防自我递归
 * - 产出：每组一条综合论断（extractionPass='consolidate#1'），成员 superseded 归档（可追溯可恢复）
 * - 编排：分批 map（无 reduce），单批失败跳过不废全场；进度供前端轮询
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import type { KbAtomRecord } from '@core/database/repositories/kb-atom.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { defaultBrainLlm, type BrainLlmFn } from './llm'
import { CONSOLIDATE_SYSTEM, buildConsolidateUser } from './prompts'
import { validateConsolidateOutput, type ConsolidateGroup } from './schemas'

/** 单批论断数：论断放开篇幅后均值 ~150 字，60 条 ≈ 7-9k token 输入，安全余量内 */
const BATCH_SIZE = 60

export interface ConsolidateProgress {
  running: boolean
  totalBatches: number
  processedBatches: number
  mergedGroups: number
  supersededAtoms: number
  failedBatches: number
  lastError?: string
}

export interface ConsolidateDeps {
  llm?: BrainLlmFn
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  atoms?: KbAtomRepository
}

const EMPTY_PROGRESS: ConsolidateProgress = {
  running: false,
  totalBatches: 0,
  processedBatches: 0,
  mergedGroups: 0,
  supersededAtoms: 0,
  failedBatches: 0,
}

export class KbConsolidateService {
  private readonly llm: BrainLlmFn
  private readonly atomsFn: NonNullable<ConsolidateDeps['atoms']> | undefined
  /** 单飞锁：整库归纳一次只跑一个 */
  private readonly running = new Set<string>()
  private readonly progress = new Map<string, ConsolidateProgress>()

  constructor(deps: ConsolidateDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate', deps.modelOverride)
    this.atomsFn = deps.atoms
  }

  isRunning(kbId: string): boolean {
    return this.running.has(kbId)
  }

  status(kbId: string): ConsolidateProgress {
    return this.progress.get(kbId) ?? EMPTY_PROGRESS
  }

  async run(kbId: string): Promise<ConsolidateProgress> {
    if (this.running.has(kbId)) throw new Error('论断归纳进行中，请稍候')
    const atoms = this.atomsFn ?? getCoreDatabaseManager().kbAtoms ?? undefined
    if (!atoms) throw new Error('知识大脑未启用（旧库）')
    this.running.add(kbId)
    const progress: ConsolidateProgress = { ...EMPTY_PROGRESS, running: true }
    this.progress.set(kbId, progress)
    try {
      // 工作集输入：supported/suspected 公共层；consolidate 产物与视角/人类观感不参与
      const all = await atoms.findByKb(kbId, { status: ['supported', 'suspected'], limit: 5000 })
      const base = all.filter(
        (a) => !a.extractionPass.startsWith('consolidate') && !a.lensNoteId && a.origin !== 'human',
      )
      const batches: KbAtomRecord[][] = []
      for (let i = 0; i < base.length; i += BATCH_SIZE) batches.push(base.slice(i, i + BATCH_SIZE))
      progress.totalBatches = batches.length
      for (const batch of batches) {
        try {
          const merged = await this.runBatch(kbId, atoms, batch)
          progress.mergedGroups += merged.groups
          progress.supersededAtoms += merged.superseded
        } catch (e) {
          // 单批失败跳过不废全场；原因如实上报
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

  /** 单批：LLM 提合并组 → 建综合论断 → 成员 superseded。归档前重查成员状态：已被并发改动（裁决/人工）则整组跳过 */
  private async runBatch(kbId: string, atoms: KbAtomRepository, batch: KbAtomRecord[]): Promise<{ groups: number; superseded: number }> {
    const raw = await this.llm({
      system: CONSOLIDATE_SYSTEM,
      user: buildConsolidateUser({
        items: batch.map((a, i) => ({ idx: i, type: a.type, statement: a.statement })),
      }),
      maxTokens: 2000,
    })
    const groups: ConsolidateGroup[] = validateConsolidateOutput(extractJsonFromResponse(raw), {
      count: batch.length,
    })
    let superseded = 0
    for (const g of groups) {
      const members = g.idx.map((i) => batch[i]!)
      const head = members[0]!
      // 并发守卫：输入是 run 起点快照，归档前按 id 重查——成员已不在工作集（状态被裁决/
      // 人工改动先行变更或已删除）则整组跳过，绝不盲目覆写他人写下的血缘
      const fresh = await atoms.findByIds(members.map((m) => m.id))
      if (
        fresh.length !== members.length ||
        fresh.some((f) => f.status !== 'supported' && f.status !== 'suspected')
      ) {
        continue
      }
      // 合并句长度护栏：模型跑偏时兜底截断（完整性靠成员归档兜底）
      const [created] = await atoms.createBatch([
        {
          knowledgeBaseId: kbId,
          statement: g.statement.slice(0, 400),
          type: g.type,
          certainty: 0.85,
          sourceDocumentId: head.sourceDocumentId,
          sourceQuote: (head.sourceQuote ?? '').slice(0, 200),
          extractionPass: 'consolidate#1',
        },
      ])
      if (!created) continue
      for (const m of members) {
        await atoms.updateStatus(m.id, { status: 'superseded', supersededByAtomId: created.id })
        superseded += 1
      }
    }
    return { groups: groups.length, superseded }
  }
}

let singleton: KbConsolidateService | null = null

export function getKbConsolidateService(): KbConsolidateService {
  if (!singleton) singleton = new KbConsolidateService()
  return singleton
}
