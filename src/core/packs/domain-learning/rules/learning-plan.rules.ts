/**
 * 领域共学「方案确认」规则（纯函数；2026-09-13 用户需求）
 * @module packs/domain-learning/rules/learning-plan.rules
 *
 * 用户拍板的固定步骤（首批知识生成 / 补全知识地图共用）：
 * 1. 先对齐诉求：模型提交「诉求理解」草案 → 用户确认或输入指令调整（可多轮）；
 * 2. 再展示知识体系：模型提交「分支 + 知识点 + 前置 + layer」方案 → 用户可勾选增删、调序；
 * 3. 用户确认后才允许落库知识点。
 *
 * 本模块负责两件纯事：**规范化/校验**（模型给的东西能不能用）与**派生**
 * （方案条目名、落库额度）。门禁与弹窗展示都读同一份派生结果，避免口径两处漂。
 */

import type {
  DlPlanSyllabus,
  DlPlanUnderstanding,
  DlSyllabusConcept,
} from '@shared/types/domain-learning.types'
import { DL_PLANNING_SAVE_BUDGET, DL_SAVE_BUDGET_MAX } from '../services/dl-agent.types'

/** 规范化结果（失败给可执行的拒绝原因，直接回给模型） */
export type PlanNormalizeResult<T> =
  | { ok: true; value: T; changes: string[] }
  | { ok: false; reason: string }

/** 通用：去空白 → 去空 → 去重（保序） */
function cleanList(input: unknown, max = 30): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const text = raw.replace(/\s+/g, ' ').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
    if (out.length >= max) break
  }
  return out
}

function cleanText(input: unknown, max = 400): string {
  return typeof input === 'string' ? input.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/**
 * 规范化「诉求理解」。
 * 硬要求：`goalSummary` 非空（模型没复述出诉求就没法让用户确认）；
 * `coverage` 至少 1 条——用户抱怨的核心就是"骨架没覆盖我点名的东西"。
 */
export function normalizePlanUnderstanding(input: unknown): PlanNormalizeResult<DlPlanUnderstanding> {
  const raw = (input ?? {}) as Record<string, unknown>
  const changes: string[] = []
  const goalSummary = cleanText(raw.goalSummary, 400)
  if (!goalSummary) {
    return {
      ok: false,
      reason: '诉求理解缺少 goalSummary（一句话把你理解的"他要学什么"说清楚，用户才有的可确认）',
    }
  }
  const coverage = cleanList(raw.coverage, 20)
  if (coverage.length === 0) {
    return {
      ok: false,
      reason:
        '诉求理解缺少 coverage（逐条列出要覆盖的对象与场景：用户点名的产品/市场/数据/动作）。' +
        '这一项是防跑偏的关键——上一版就是因为没有它，把"股票/债券/期货/美元、读财报与行情"做成了记账与保险。',
    }
  }
  const audience = cleanText(raw.audience, 200)
  const notDoing = cleanList(raw.notDoing, 15)
  const keyExpectations = cleanList(raw.keyExpectations, 15)
  if (audience) changes.push('补全读者画像')
  return {
    ok: true,
    changes,
    value: {
      goalSummary,
      coverage,
      audience: audience || null,
      notDoing,
      keyExpectations,
    },
  }
}

/**
 * 规范化「知识体系方案」。
 * 硬要求：
 * - 至少 1 个分支且每个分支至少 1 个知识点（**空分支正是上一版的 bug**：「投资与配置」没有子知识点）；
 * - 知识点名非空；重名（跨分支）去重并记入 changes。
 */
export function normalizePlanSyllabus(input: unknown): PlanNormalizeResult<DlPlanSyllabus> {
  const raw = (input ?? {}) as Record<string, unknown>
  const branchesRaw = Array.isArray(raw.branches) ? raw.branches : []
  if (branchesRaw.length === 0) {
    return { ok: false, reason: '知识体系方案缺少 branches（至少一个分支目录 + 其知识点）' }
  }
  const changes: string[] = []
  const seen = new Set<string>()
  const branches: DlPlanSyllabus['branches'] = []

  const normalizeConcept = (c: unknown): DlSyllabusConcept | null => {
    const obj = (c ?? {}) as Record<string, unknown>
    const name = cleanText(obj.name, 120)
    if (!name) return null
    if (seen.has(name)) {
      changes.push(`知识点「${name}」在方案里重复出现，已去重（保留首次出现的位置）`)
      return null
    }
    seen.add(name)
    const layer = Number(obj.layer)
    return {
      name,
      definitionShort: cleanText(obj.definitionShort, 300) || null,
      prerequisites: cleanList(obj.prerequisites, 12),
      layer: Number.isFinite(layer) && layer >= 0 ? Math.floor(layer) : 0,
      nodeType: cleanText(obj.nodeType, 20) || 'concept',
    }
  }

  for (const b of branchesRaw) {
    const obj = (b ?? {}) as Record<string, unknown>
    const name = cleanText(obj.name, 120)
    if (!name) {
      return { ok: false, reason: '知识体系方案里有一个分支没有 name——每个分支都要有名字（如「金融产品」「风险与收益」）' }
    }
    if (seen.has(name)) {
      changes.push(`分支「${name}」重复出现，已去重`)
      continue
    }
    seen.add(name)
    const conceptsRaw = Array.isArray(obj.concepts) ? obj.concepts : []
    const concepts: DlSyllabusConcept[] = []
    for (const c of conceptsRaw) {
      const normalized = normalizeConcept(c)
      if (normalized) concepts.push(normalized)
    }
    if (concepts.length === 0) {
      return {
        ok: false,
        reason:
          `分支「${name}」下没有任何知识点（空分支）。上一版「投资与配置」就是空的——` +
          `请给每个分支补上知识点，或删掉这个分支后再提交。`,
      }
    }
    branches.push({ name, definitionShort: cleanText(obj.definitionShort, 300) || null, concepts })
  }

  const rootConcepts: DlSyllabusConcept[] = []
  const rootRaw = Array.isArray(raw.rootConcepts) ? raw.rootConcepts : []
  for (const c of rootRaw) {
    const normalized = normalizeConcept(c)
    if (normalized) {
      normalized.nodeType = 'concept'
      rootConcepts.push(normalized)
    }
  }

  const total = branches.reduce((n, b) => n + b.concepts.length, 0) + rootConcepts.length
  if (total === 0) {
    return { ok: false, reason: '知识体系方案里没有任何知识点（分支下都是空的）' }
  }
  return {
    ok: true,
    changes,
    value: { branches, rootConcepts, notes: cleanText(raw.notes, 600) || null },
  }
}

/** 方案里的全部名字（分支 + 根层 + 知识点） */
export function planNodeNames(syllabus: DlPlanSyllabus | null | undefined): string[] {
  if (!syllabus) return []
  const out: string[] = []
  for (const b of syllabus.branches ?? []) {
    out.push(b.name)
    for (const c of b.concepts ?? []) out.push(c.name)
  }
  for (const c of syllabus.rootConcepts ?? []) out.push(c.name)
  return out
}

/** 方案里的知识点名（不含分支目录名） */
export function planConceptNames(syllabus: DlPlanSyllabus | null | undefined): string[] {
  if (!syllabus) return []
  const out: string[] = []
  for (const b of syllabus.branches ?? []) for (const c of b.concepts ?? []) out.push(c.name)
  for (const c of syllabus.rootConcepts ?? []) out.push(c.name)
  return out
}

/** 方案节点总数（分支 + 知识点） */
export function countPlanNodes(syllabus: DlPlanSyllabus | null | undefined): number {
  return planNodeNames(syllabus).length
}

/** 已确认方案里是否包含该知识点（按名精确比对，两侧都 trim） */
export function planHasConcept(syllabus: DlPlanSyllabus | null | undefined, name: string): boolean {
  const target = String(name ?? '').trim()
  if (!target) return false
  return planConceptNames(syllabus).some((n) => n.trim() === target)
}

/** 额度夹取（≥1 且不超过上限） */
function clampBudget(n: number, max: number): number {
  return Math.max(1, Math.min(max, Math.floor(n)))
}

/**
 * 按方案规模派生落库额度（用户要求「额度按方案条目数放宽」）。
 * - 概念/分支：方案节点数 + 6 余量（补缺口概念也算在里），且不低于默认规划额度；
 * - 关系边：约 1.4 倍节点 + 4，且不低于默认规划额度；
 * - 全部夹到 `max`（来自平台预算 `agent:budget`.domainLearning.maxSaveBudget，缺省用内置默认）。
 */
export function planSaveBudget(
  syllabus: DlPlanSyllabus | null | undefined,
  defaults: { concepts: number; relations: number } = DL_PLANNING_SAVE_BUDGET,
  max: number = DL_SAVE_BUDGET_MAX,
): {
  concepts: number
  relations: number
} {
  const nodes = countPlanNodes(syllabus)
  const cap = Math.max(1, Math.floor(max))
  return {
    concepts: clampBudget(Math.max(defaults.concepts, nodes + 6), cap),
    relations: clampBudget(Math.max(defaults.relations, Math.ceil(nodes * 1.4) + 4), cap),
  }
}

/** 方案摘要（动作摘要/进度行用） */
export function summarizePlanSyllabus(syllabus: DlPlanSyllabus): string {
  const branches = syllabus.branches?.length ?? 0
  const concepts = planConceptNames(syllabus).length
  return `${branches} 个分支 / ${concepts} 个知识点`
}
