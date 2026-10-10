/**
 * 提炼维度库服务（v3 M1）：维度=提取/归纳的「镜头」，不写死诉求清单——
 * 种子预置开库即有，新维度从语料归纳建议（schema induction），加维度不改产线。
 * @module platform/services/kb-brain/dimension-induct
 *
 * - ensureSeeded：首次访问补种子（source=seed, enabled）
 * - enabledHints：启用维度 → 冶炼归纳提示（pattern-induct 注入——当前的唯一消费方）
 * - propose：抽样既有知识（synthesis 卡标题 + 场面类型分布）→ LLM 归纳建议维度
 *   （source=induced, 默认停用——用户在维度管理界面增删；M4 前由种子驱动消费）
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbDimensionRepository } from '@core/database/repositories/kb-dimension.repository'
import type { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import type { KbEventRepository } from '@core/database/repositories/kb-event.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import {
  createKbScopedLlm,
  BRAIN_LLM_MAX_TOKENS,
  type BrainLlmFn,
  type BrainModelRef,
  type KbScopedLlm
} from './llm'
import { DIMENSION_INDUCT_SYSTEM, buildDimensionInductUser } from './prompts'

const logger = createLogger('KbDimensionInduct')

/** 单次建议上限（防一轮灌一库） */
const PROPOSE_CAP = 8

/** 预置种子维度（小说向初版；induced/human 补充长尾） */
export const SEED_DIMENSIONS: Array<{ name: string; definition: string; hint: string }> = [
  { name: '升级节奏', definition: '主角力量/地位提升的间隔与幅度规律', hint: '看突破/晋升的间隔、代价与幅度如何安排，先抑后扬的节拍' },
  { name: '钩子体系', definition: '开篇钩子、章末钩子、卷末爆点的制造手法', hint: '看悬念在什么位置、以什么方式挂起与兑现' },
  { name: '冲突升级', definition: '冲突的层级攀升与变奏方式', hint: '看对手层级、赌注大小、手段烈度如何逐级加码而不重复' },
  { name: '信息差运用', definition: '角色间/读者与角色间的认知差制造与揭示', hint: '看谁知道什么、读者知道什么、揭示的时机与代价' },
  { name: '情感推进', definition: '关系线的推进节拍与阻力设计', hint: '看情感事件的间隔、阻力来源、升温与挫折的交替' },
  { name: '期待感管理', definition: '向读者许诺什么期待、如何延迟满足、何时兑现加码', hint: '看许诺-延迟-兑现的链条与兑现时的超预期设计' },
  { name: '世界观揭示', definition: '世界规则与背景的揭示节奏与方式', hint: '看设定信息如何分批放出、借什么事件/人物之口揭示' },
  { name: '代价与代价结构', definition: '力量/胜利的代价设计与偿付方式', hint: '看每次收获付出了什么、代价如何影响后续剧情' },
]

export interface DimensionInductDeps {
  llm?: BrainLlmFn
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  dimensions?: KbDimensionRepository
  notes?: KbNoteRepository
  events?: KbEventRepository
}

export interface DimensionInductOutcome {
  seeded: number
  proposed: number
  skipped: boolean
  reason?: string
}

export class KbDimensionInductService {
  private readonly scoped: KbScopedLlm
  private readonly dimsFn: NonNullable<DimensionInductDeps['dimensions']> | undefined
  private readonly notesFn: NonNullable<DimensionInductDeps['notes']> | undefined
  private readonly eventsFn: NonNullable<DimensionInductDeps['events']> | undefined
  private readonly running = new Set<string>()

  constructor(deps: DimensionInductDeps = {}) {
    this.scoped = createKbScopedLlm('kb-brain-adjudicate', {
      injected: deps.llm,
      fallback: deps.modelOverride
    })
    this.dimsFn = deps.dimensions
    this.notesFn = deps.notes
    this.eventsFn = deps.events
  }

  setModelOverride(kbId: string, fn: () => BrainModelRef): void {
    this.scoped.setOverride(kbId, fn)
  }

  private repos(): { dims: KbDimensionRepository; notes: KbNoteRepository | null; events: KbEventRepository | null } | null {
    const db = safeManager()
    const dims = this.dimsFn ?? db?.kbDimensions ?? undefined
    if (!dims) return null
    return { dims, notes: this.notesFn ?? db?.kbNotes ?? null, events: this.eventsFn ?? db?.kbEvents ?? null }
  }

  isRunning(kbId: string): boolean {
    return this.running.has(kbId)
  }

  /** 启用维度 → 归纳提示行（冶炼注入用） */
  async enabledHints(kbId: string): Promise<string[]> {
    const r = this.repos()
    if (!r) return []
    const rows = await r.dims.listEnabled(kbId)
    return rows.map((d) => `${d.name}：${d.hint || d.definition}`)
  }

  /** 首次访问补种子（幂等，同名跳过）。返回实际新建数。 */
  async ensureSeeded(kbId: string): Promise<number> {
    const r = this.repos()
    if (!r) return 0
    let n = 0
    for (const d of SEED_DIMENSIONS) {
      if (await r.dims.insertIfAbsent(kbId, { ...d, source: 'seed', enabled: true })) n += 1
    }
    return n
  }

  /**
   * 从语料归纳建议维度：抽样 synthesis 卡标题（既有归纳的浓缩）+ 场面类型分布 →
   * LLM 提出库里还没有的维度 → 落库（induced，停用待启用）。素材不足则跳过。
   */
  async propose(kbId: string): Promise<DimensionInductOutcome> {
    if (this.running.has(kbId)) return { seeded: 0, proposed: 0, skipped: true, reason: '进行中' }
    const r = this.repos()
    if (!r) return { seeded: 0, proposed: 0, skipped: true, reason: '知识大脑未启用' }
    this.running.add(kbId)
    try {
      const seeded = await this.ensureSeeded(kbId)
      const existing = await r.dims.listAll(kbId)
      const knownNames = new Set(existing.map((d) => d.name.trim()))
      const synthesis = (await r.notes?.listByStatus(kbId, 'published', 1, 30, 'synthesis'))?.rows ?? []
      const proposedSynth = (await r.notes?.listByStatus(kbId, 'proposed', 1, 30, 'synthesis'))?.rows ?? []
      const titles = [...synthesis, ...proposedSynth].map((c) => c.title).slice(0, 40)
      const sceneStats = await r.events?.statsBySceneType(kbId)
      const material = {
        titles,
        sceneStats: sceneStats ?? {},
        existingDimensions: [...knownNames],
      }
      if (titles.length < 3) {
        return { seeded, proposed: 0, skipped: true, reason: '归纳素材不足（synthesis 卡 <3）' }
      }

      const raw = await this.scoped.llmFor(kbId)({
        system: DIMENSION_INDUCT_SYSTEM,
        user: buildDimensionInductUser(material),
        maxTokens: BRAIN_LLM_MAX_TOKENS
      })
      const proposals = parseDimensionProposals(raw)
      let proposed = 0
      for (const p of proposals) {
        if (proposed >= PROPOSE_CAP) break
        if (knownNames.has(p.name.trim())) continue
        if (await r.dims.insertIfAbsent(kbId, { ...p, source: 'induced', enabled: false })) {
          knownNames.add(p.name.trim())
          proposed += 1
        }
      }
      if (proposed > 0) logger.info(`[kb-dimension] kb=${kbId} 归纳建议 ${proposed} 个新维度（停用待启用）`)
      return { seeded, proposed, skipped: false }
    } finally {
      this.running.delete(kbId)
    }
  }
}

/** 解析建议输出：{dimensions:[{name,definition,hint}]}——非法项剔除、缺名跳过 */
export function parseDimensionProposals(raw: string): Array<{ name: string; definition: string; hint: string }> {
  const parsed = extractJsonFromResponse(raw) as Partial<{ dimensions: unknown }> | null
  const arr = Array.isArray(parsed?.dimensions) ? (parsed!.dimensions as unknown[]) : []
  const out: Array<{ name: string; definition: string; hint: string }> = []
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue
    const name = (item as { name?: unknown }).name
    if (typeof name !== 'string' || !name.trim() || name.length > 20) continue
    out.push({
      name: name.trim(),
      definition: typeof (item as { definition?: unknown }).definition === 'string' ? (item as { definition: string }).definition : '',
      hint: typeof (item as { hint?: unknown }).hint === 'string' ? (item as { hint: string }).hint : '',
    })
  }
  return out
}

function safeManager(): ReturnType<typeof getCoreDatabaseManager> | null {
  try {
    return getCoreDatabaseManager()
  } catch {
    return null
  }
}

let singleton: KbDimensionInductService | null = null

export function getKbDimensionInductService(): KbDimensionInductService {
  if (!singleton) singleton = new KbDimensionInductService()
  return singleton
}
