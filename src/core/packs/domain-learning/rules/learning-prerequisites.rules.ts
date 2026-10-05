/**
 * 领域学习「前置要求」纯规则（2026-09-12 用户需求：主题级 + 知识点级前置）
 * @module packs/domain-learning/rules/learning-prerequisites.rules
 *
 * 用户口径：
 * 1. **整个主题学习的前置要求**——学这个领域之前需要具备什么（可以是领域外能力，
 *    如「Python 基础」「线性代数基础」），落库在 dl_project.prerequisites，
 *    学习者一进空间就该看到门槛；
 * 2. **每个知识点的前置要求**——生成知识点时就要声明"学它之前必须先掌握什么"，
 *    既声明在 dl_concept.attrs.prerequisites（立即可见、待建关系），
 *    也要落成 dl_relation 的 prerequisite 边（图/门控权威）；
 * 3. **循序渐进**——顺序必须从基础到前沿，前置不齐不许硬排。
 *
 * 本模块只做纯计算（规范化 / 快照简报 / 缺口检测 / 与前置能力匹配），
 * 落库与门禁分别由 dl-agent-actions 与 learning-progression.rules 使用。
 */

import type { DlSpacePrereq } from '@shared/types/domain-learning.types'

/** 主题前置要求条数上限（防模型倒垃圾） */
export const SPACE_PREREQ_MAX = 12
/** 单个知识点前置条数上限 */
export const CONCEPT_PREREQ_MAX = 12

/** 前置要求最小形状（宽松入参：模型/用户给的数据可能是各种形态） */
export interface PrereqLike {
  name?: unknown
  why?: unknown
  level?: unknown
  inSpace?: unknown
}

/** 概念最小形状（本模块只读这三项） */
export interface PrereqConcept {
  id: string
  name: string
  nodeType?: string
  attrs?: Record<string, unknown> | null
}

/** 关系边最小形状 */
export interface PrereqRelation {
  source: string
  target: string
  type: string
}

/** 文本字段清洗（去空白、限长） */
function cleanText(raw: unknown, max: number): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max) : s
}

/**
 * 规范化主题前置要求：去空名、按名去重（保留首条）、限条数。
 * @param raw 模型/用户给的任意形态（数组，或 { items: [...] }）
 */
export function normalizeSpacePrereqs(raw: unknown): DlSpacePrereq[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown })?.items)
      ? ((raw as { items: unknown[] }).items as unknown[])
      : []
  const out: DlSpacePrereq[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (out.length >= SPACE_PREREQ_MAX) break
    const src = (typeof item === 'string' ? { name: item } : item) as PrereqLike
    const name = cleanText(src?.name, 60)
    if (!name || seen.has(name)) continue
    seen.add(name)
    const entry: DlSpacePrereq = { name }
    const why = cleanText(src?.why, 200)
    if (why) entry.why = why
    const level = cleanText(src?.level, 120)
    if (level) entry.level = level
    if (src?.inSpace === true) entry.inSpace = true
    out.push(entry)
  }
  return out
}

/**
 * 规范化知识点前置名（去空、去重、去掉自己、限条数）。
 * @param selfName 当前概念名（不能把自己当自己的前置）
 */
export function normalizeConceptPrereqs(raw: unknown, selfName?: string | null): string[] {
  const list = Array.isArray(raw) ? raw : []
  const out: string[] = []
  const self = cleanText(selfName, 60)
  for (const item of list) {
    if (out.length >= CONCEPT_PREREQ_MAX) break
    const name = cleanText(typeof item === 'string' ? item : (item as PrereqLike)?.name, 60)
    if (!name || name === self || out.includes(name)) continue
    out.push(name)
  }
  return out
}

/** 取概念"声明的前置名"（dl_concept.attrs.prerequisites） */
export function declaredPrereqsOf(concept: PrereqConcept): string[] {
  const attrs = concept.attrs ?? {}
  const raw = (attrs as { prerequisites?: unknown }).prerequisites
  return normalizeConceptPrereqs(raw, concept.name)
}

/** 图中某概念的前置：关系边（权威）+ 声明（补充），去重保序 */
export function prerequisiteNamesOf(
  concept: PrereqConcept,
  concepts: PrereqConcept[],
  relations: PrereqRelation[],
): { fromGraph: string[]; declaredOnly: string[] } {
  const byId = new Map(concepts.map((c) => [c.id, c] as const))
  const fromGraph: string[] = []
  for (const r of relations) {
    if (r.type !== 'prerequisite' || r.target !== concept.id) continue
    const name = byId.get(r.source)?.name ?? r.source
    if (!fromGraph.includes(name)) fromGraph.push(name)
  }
  const declaredOnly = declaredPrereqsOf(concept).filter((n) => !fromGraph.includes(n))
  return { fromGraph, declaredOnly }
}

/** 某"前置名"在空间里的归属判定 */
export type PrereqNameMatch = 'concept' | 'space' | 'missing'

/** 前置名是否能在空间里找到落点（同名知识点 / 主题前置清单） */
export function matchPrereqName(
  name: string,
  concepts: PrereqConcept[],
  spacePrereqs: DlSpacePrereq[],
): PrereqNameMatch {
  const n = cleanText(name, 60)
  if (!n) return 'missing'
  if (concepts.some((c) => c.nodeType !== 'group' && (c.name === n || c.name.includes(n) || n.includes(c.name)))) {
    return 'concept'
  }
  if (spacePrereqs.some((p) => p.name === n || p.name.includes(n) || n.includes(p.name))) return 'space'
  return 'missing'
}

/** 前置声明缺口（给模型看的补课清单） */
export interface PrereqShortfall {
  conceptId: string
  conceptName: string
  /** 声明了、但既没建关系边也没在空间里找到落点的前置名 */
  missing: string[]
}

/**
 * 扫描全空间：哪些概念"声明了前置但没有落点"。
 * 用于快照提示模型补 dl_save_concept / dl_save_relation / dl_save_space_prereqs。
 */
export function collectPrereqShortfalls(input: {
  concepts: PrereqConcept[]
  relations: PrereqRelation[]
  spacePrereqs?: DlSpacePrereq[]
}): PrereqShortfall[] {
  const leaves = input.concepts.filter((c) => c.nodeType !== 'group')
  const spacePrereqs = input.spacePrereqs ?? []
  const out: PrereqShortfall[] = []
  for (const c of leaves) {
    const { declaredOnly } = prerequisiteNamesOf(c, leaves, input.relations)
    const missing = declaredOnly.filter((n) => matchPrereqName(n, leaves, spacePrereqs) === 'missing')
    if (missing.length) out.push({ conceptId: c.id, conceptName: c.name, missing })
  }
  return out
}

/** 声明了前置但尚未建关系边的概念（提示补 dl_save_relation） */
export function collectRelationGaps(input: {
  concepts: PrereqConcept[]
  relations: PrereqRelation[]
}): Array<{ conceptId: string; conceptName: string; pending: string[] }> {
  const leaves = input.concepts.filter((c) => c.nodeType !== 'group')
  const out: Array<{ conceptId: string; conceptName: string; pending: string[] }> = []
  for (const c of leaves) {
    const { declaredOnly } = prerequisiteNamesOf(c, leaves, input.relations)
    if (declaredOnly.length) out.push({ conceptId: c.id, conceptName: c.name, pending: declaredOnly })
  }
  return out
}

/**
 * 生成「前置要求」快照简报（注入研究会话）。
 * 让模型每一轮都看到：主题门槛是什么、各知识点前置是什么、还差什么没落库。
 */
export function buildPrerequisiteBriefing(input: {
  spacePrereqs?: DlSpacePrereq[]
  concepts: PrereqConcept[]
  relations: PrereqRelation[]
}): string[] {
  const spacePrereqs = input.spacePrereqs ?? []
  const lines: string[] = []

  if (spacePrereqs.length === 0) {
    lines.push(
      '【主题前置要求】尚未声明——请用 dl_save_space_prereqs 落库：学「整个领域」之前需要具备什么（含领域外能力，如 Python 基础 / 线性代数基础），每条给"为什么需要"与"掌握到什么程度即可"；若确实无需任何前置，也要显式说明。',
    )
  } else {
    lines.push('【主题前置要求】（学习者进空间即见；inSpace=空间内已建知识点会教）')
    for (const p of spacePrereqs) {
      const bits = [p.why, p.level].filter((x): x is string => !!x)
      const tag = p.inSpace ? '空间内已建知识点' : '需自备/另行补课'
      lines.push(`- ${p.name}（${tag}${bits.length ? '；' + bits.join('；') : ''}）`)
    }
  }

  const leaves = input.concepts.filter((c) => c.nodeType !== 'group')
  const prereqLines: string[] = []
  for (const c of leaves) {
    const { fromGraph, declaredOnly } = prerequisiteNamesOf(c, leaves, input.relations)
    if (!fromGraph.length && !declaredOnly.length) continue
    const parts: string[] = []
    if (fromGraph.length) parts.push(`已建关系：${fromGraph.join('、')}`)
    if (declaredOnly.length) parts.push(`仅声明未建关系：${declaredOnly.join('、')}`)
    prereqLines.push(`- ${c.name} ← ${parts.join(' ；')}`)
  }
  if (prereqLines.length) {
    lines.push('【各知识点前置】（学习顺序依据；用 dl_save_relation 补未建的关系边，source=前置、target=本概念）')
    lines.push(...prereqLines)
  } else {
    lines.push(
      '【各知识点前置】尚未声明——生成知识点时必须逐个给出 prerequisites（学它之前必须先掌握什么），并落成 prerequisite 关系边；顺序要循序渐进，前置不齐不要硬排。',
    )
  }

  for (const gap of collectRelationGaps({ concepts: leaves, relations: input.relations })) {
    lines.push(
      `⚠️ 「${gap.conceptName}」的前置（${gap.pending.join('、')}）只有声明没有关系边——请 dl_save_relation 补（source→target=本概念）。`,
    )
  }
  for (const short of collectPrereqShortfalls({ concepts: leaves, relations: input.relations, spacePrereqs })) {
    lines.push(
      `⚠️ 「${short.conceptName}」的前置（${short.missing.join('、')}）在空间里没有落点——请 dl_save_concept 建成知识点并排在本概念之前（或若属领域外必备，用 dl_save_space_prereqs 列入主题前置要求）。`,
    )
  }
  return lines
}

/**
 * 前置能力是否已被主题前置要求覆盖（学习门槛已明示）。
 * 供讲义循序渐进门禁使用：主题前置里声明过，就不再强制空间内有对应知识点。
 */
export function coveredBySpacePrereqs(
  skillLabel: string,
  skillKeywords: string[],
  spacePrereqs: DlSpacePrereq[],
): boolean {
  if (!spacePrereqs.length) return false
  const tokens = [skillLabel, ...skillKeywords].map((t) => cleanText(t, 60)).filter(Boolean)
  return spacePrereqs.some((p) => tokens.some((t) => p.name.includes(t) || t.includes(p.name)))
}

/**
 * 判定 candidateId 是否是 conceptId 的前置祖先（沿 prerequisite 边反向可达，允许任意深度）。
 * 原实现住在 learning-progression.rules（讲义门禁用）；2026-09-25 起迁到本模块作为
 * 全模块唯一的"前置可达性"实现——建边防环（dl-agent-actions / learning-graph）与
 * 讲义循序渐进门禁共用同一套遍历，避免两处口径漂移。
 */
export function isPrerequisiteAncestor(
  relations: PrereqRelation[],
  conceptId: string,
  candidateId: string,
): boolean {
  if (!conceptId || conceptId === candidateId) return false
  const edges = relations.filter((r) => r.type === 'prerequisite')
  const seen = new Set<string>()
  const queue = [conceptId]
  while (queue.length) {
    const current = queue.shift()!
    for (const e of edges) {
      if (e.target !== current) continue
      if (e.source === candidateId) return true
      if (!seen.has(e.source)) {
        seen.add(e.source)
        queue.push(e.source)
      }
    }
  }
  return false
}

/**
 * 新增前置边 source→target 是否会构成环（2026-09-25 P0-1 修复）。
 * 语义：target 已经是 source 的前置祖先 ⟺ 加上这条边后 source⇝target⇝source 成环——
 * 环上每个概念的前置都互相未掌握，`ackMastered` 永远拒绝，学习路径死锁。
 * 三个建边入口（saveRelation / confirmRelation / 手工连边）落边前都必须过这道检查。
 */
export function wouldCreatePrereqCycle(
  relations: PrereqRelation[],
  sourceId: string,
  targetId: string,
): boolean {
  return isPrerequisiteAncestor(relations, sourceId, targetId)
}
