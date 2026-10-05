/**
 * 领域知识地图「完整度」诊断（纯函数；2026-09-12 用户反馈"知识体系不够完善"）
 * @module packs/domain-learning/rules/learning-map-coverage.rules
 *
 * 背景：研究模式一次只保证"给当前概念一张讲义"（saveCard 的 expectedConceptId 锁死当前概念），
 * 地图扩张只能靠 ① 空空间 bootstrap 的首批 3-8 个概念 ② 难度/循序渐进门禁逼出的前置 ③ 用户手工建点
 * ④ 显式的「AI 补全」。于是"逐概念研究"并不会让体系变完整——深度学习空间停在 8 个知识点，
 * 而验收期的贝叶斯空间有 228 个。
 *
 * 本模块把"体系完不完整"变成**可测量、可解释、可注入提示词**的诊断：
 * 只做能确定性判定的事（结构/可达性/交付率/粒度词），不假装能枚举"缺了哪些领域概念"
 * （那是模型的活）；输出缺口清单交给模型去补，并给出 0-100 的完整度评分供 UI 展示与前后对比。
 */

import type { DlSpacePrereq } from '@shared/types/domain-learning.types'

/** 诊断用概念最小形状 */
export interface CoverageConcept {
  id: string
  name: string
  nodeType?: string
  parentId?: string | null
  researchState?: string
  cardId?: string | null
  attrs?: Record<string, unknown> | null
}

/** 诊断用关系最小形状 */
export interface CoverageRelation {
  source: string
  target: string
  type: string
  verified?: boolean
}

/** 缺口类型（确定性可判定） */
export type MapGapKind =
  | 'no-entry'
  | 'cycle'
  | 'unreachable'
  | 'flat-trunk'
  | 'funnel'
  | 'declared-only'
  | 'no-lesson'
  | 'coarse'
  | 'flat-branches'
  | 'no-space-prereq'

export interface MapGap {
  kind: MapGapKind
  severity: 'high' | 'medium'
  message: string
  /** 涉及的概念名（便于 UI 定位/提示词点名） */
  conceptNames?: string[]
}

export interface MapCoverageResult {
  /** 0-100：越高说明"从入口到前沿的台阶 + 前置边 + 讲义交付"越齐 */
  score: number
  metrics: {
    /** 知识节点（不含目录） */
    leaves: number
    groups: number
    /** 前置边（仅 prerequisite 类型，去重后） */
    edges: number
    verifiedEdges: number
    /** 入口概念（无前置） */
    entries: number
    /** 学习路径层数（最长前置链 + 1） */
    levels: number
    /** 已有讲义的节点数 */
    lessons: number
  }
  gaps: MapGap[]
  /** 给模型/UI 的一行摘要 */
  summary: string
}

/** 领域级"整块"词：这类名字出现在知识点上通常是粒度太粗（不含"基础/入门"——那是合法的基础概念命名） */
const COARSE_NAME_RE = /(领域|体系|学科|方向|概述|导论|总览|方法学|技术栈)$/
/** 一句话当概念名（过长）也算粒度问题 */
const LONG_NAME_LEN = 14
/** 少于 3 层且节点 ≥ 5 视为"平铺一层"（不是台阶式路径） */
const MIN_LEVELS = 3
const FLAT_TRUNK_MIN_LEAVES = 5
/** 起点直接汇入同一概念：≥ 2 个起点 + 该概念层级 ≥ 2 → 中间缺台阶 */
const FUNNEL_MIN_ENTRY_FED = 2
const FUNNEL_MIN_LEVEL = 2

/** 规范化前置边：只取 prerequisite、去自环、去重（source→target） */
function prereqEdges(relations: CoverageRelation[]): Array<{ source: string; target: string; verified: boolean }> {
  const seen = new Set<string>()
  const out: Array<{ source: string; target: string; verified: boolean }> = []
  for (const r of relations) {
    if (r.type !== 'prerequisite' || !r.source || !r.target || r.source === r.target) continue
    const key = `${r.source}→${r.target}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ source: r.source, target: r.target, verified: !!r.verified })
  }
  return out
}

/** 每个概念的最长前置链长度（入口=0）；返回 null 表示存在环/不可解（保守取 0） */
export function levelsOf(
  ids: string[],
  edges: Array<{ source: string; target: string }>,
): Map<string, number> {
  const incoming = new Map<string, string[]>()
  for (const id of ids) incoming.set(id, [])
  for (const e of edges) {
    if (incoming.has(e.target) && incoming.has(e.source)) incoming.get(e.target)!.push(e.source)
  }
  const level = new Map<string, number>()
  const visiting = new Set<string>()
  const compute = (id: string): number => {
    const cached = level.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0 // 环：保守处理，不递归
    visiting.add(id)
    let best = 0
    for (const src of incoming.get(id) ?? []) best = Math.max(best, compute(src) + 1)
    visiting.delete(id)
    level.set(id, best)
    return best
  }
  for (const id of ids) compute(id)
  return level
}

/**
 * 从入口出发沿前置边可达到的节点集合。
 * - 入口 = 集合内**没有任何入边**的节点（入边来源即使不在集合里也算入边——"前置漏建"的节点
 *   不该被当成入口，否则"接不上的知识点"会被误判为可学）；
 * - 全无入口（如存在环）时退化为以全部节点为起点（保守不误报不可达）。
 */
export function reachableFrom(
  ids: string[],
  edges: Array<{ source: string; target: string }>,
): Set<string> {
  const known = new Set(ids)
  const outgoing = new Map<string, string[]>()
  const incomingCount = new Map<string, number>()
  for (const id of ids) {
    outgoing.set(id, [])
    incomingCount.set(id, 0)
  }
  for (const e of edges) {
    if (!known.has(e.target)) continue
    incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1)
    if (known.has(e.source)) outgoing.get(e.source)!.push(e.target)
  }
  const entries = ids.filter((id) => (incomingCount.get(id) ?? 0) === 0)
  const start = entries.length ? entries : ids
  const seen = new Set<string>(start)
  const queue = [...start]
  while (queue.length) {
    const cur = queue.shift()!
    for (const next of outgoing.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

/**
 * 检测前置图中的环（2026-09-25 P0-1 配套）：返回"在某条环上"的节点 id。
 * 判定＝从节点出发沿前置边能回到自身（个人规模图 O(V·(V+E)) 足够；建边入口已有
 * wouldCreatePrereqCycle 前置拦截，这里是对存量数据的诊断兜底）。
 */
export function detectPrereqCycles(
  ids: string[],
  edges: Array<{ source: string; target: string }>,
): string[] {
  const known = new Set(ids)
  const outgoing = new Map<string, string[]>()
  for (const id of ids) outgoing.set(id, [])
  for (const e of edges) {
    if (known.has(e.source) && known.has(e.target)) outgoing.get(e.source)!.push(e.target)
  }
  const onCycle: string[] = []
  for (const start of ids) {
    const visited = new Set<string>()
    const stack = [...(outgoing.get(start) ?? [])]
    while (stack.length) {
      const cur = stack.pop()!
      if (cur === start) {
        onCycle.push(start)
        break
      }
      if (visited.has(cur)) continue
      visited.add(cur)
      stack.push(...(outgoing.get(cur) ?? []))
    }
  }
  return onCycle
}

/**
 * 地图完整度诊断。
 * 评分口径（可解释、可回归）：基础 100 分，按下述缺口扣分并夹在 0-100：
 * - 无入口 -25（high）
 * - 前置环 -25（high；2026-09-25：环死锁是结构上最重的缺口）
 * - 不可达节点 -12 × 批次数（最多 -24，high）
 * - 平铺一层（层数 < 3 且叶 ≥ 5）-15（high）
 * - 多入口汇入同一概念（缺中间台阶）-6 × 处（最多 -12，medium）
 * - 声明未落边 -5 × 条（最多 -15，medium）
 * - 讲义交付率：按未建讲义比例 × 20（medium）
 * - 粒度太粗 -5 × 个（最多 -10，medium）
 * - 分支结构：只有 1 个目录且叶 ≥ 6 → -8（medium）
 * - 主题前置未声明 -8（medium）
 */
export function assessMapCoverage(input: {
  concepts: CoverageConcept[]
  relations: CoverageRelation[]
  spacePrereqs?: DlSpacePrereq[]
  /** 空间名（用于识别"把整个领域当知识点"，如空间「深度学习」里有个知识点也叫「深度学习」） */
  spaceName?: string | null
}): MapCoverageResult {
  const leaves = input.concepts.filter((c) => c.nodeType !== 'group')
  const groups = input.concepts.filter((c) => c.nodeType === 'group')
  const ids = leaves.map((c) => c.id)
  const nameOf = new Map(leaves.map((c) => [c.id, c.name] as const))
  const edges = prereqEdges(input.relations)
  const gaps: MapGap[] = []

  // 还没有任何知识点：0 分（避免"干净的空地图"拿高分，误导模型以为体系已经不错）
  if (ids.length === 0) {
    return {
      score: 0,
      metrics: { leaves: 0, groups: groups.length, edges: 0, verifiedEdges: 0, entries: 0, levels: 0, lessons: 0 },
      gaps: [
        {
          kind: 'no-entry',
          severity: 'high',
          message: '还没有任何知识点——先做一次起步研究（或手工建点）把领域主干建起来',
        },
      ],
      summary: '地图完整度 0/100：还没有任何知识点（先做一次起步研究或手工建点）',
    }
  }

  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  for (const id of ids) {
    incoming.set(id, 0)
    outgoing.set(id, 0)
  }
  for (const e of edges) {
    if (!incoming.has(e.target) || !outgoing.has(e.source)) continue
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1)
    outgoing.set(e.source, (outgoing.get(e.source) ?? 0) + 1)
  }

  const entryIds = ids.filter((id) => (incoming.get(id) ?? 0) === 0)
  const level = levelsOf(ids, edges)
  const levels = Math.max(...ids.map((id) => level.get(id) ?? 0)) + 1
  const reachable = reachableFrom(ids, edges)
  // "已建讲义"以卡片为准（researchState='extracted' 只说明研究过、不代表有讲义）
  const lessons = leaves.filter((c) => !!c.cardId).length

  let score = 100

  // ① 入口
  if (entryIds.length === 0) {
    gaps.push({
      kind: 'no-entry',
      severity: 'high',
      message: '没有任何"无前置"的起点概念——学习路径没有入口（要么漏建基础概念，要么前置边指反了）',
    })
    score -= 25
  }

  // ①b 前置环（2026-09-25 P0-1 配套）：环上概念互相等对方先掌握，永远无法标记"懂了"，
  // 掌握门控与排程整体失效——必须人工删边修复（Atlas 节点档案「直接关系」→ 删除）
  const cycleIds = detectPrereqCycles(ids, edges)
  if (cycleIds.length) {
    const cycleNames = cycleIds.map((id) => nameOf.get(id) ?? id)
    gaps.push({
      kind: 'cycle',
      severity: 'high',
      message:
        `前置关系成环（${cycleNames.slice(0, 6).join('、')}${cycleNames.length > 6 ? ' 等' : ''}）——` +
        '环上的知识点互相等对方先掌握，学习路径死锁：请在知识全景图的节点档案「直接关系」里删除环上任意一条边',
      conceptNames: cycleNames.slice(0, 6),
    })
    score -= 25
  }

  // ② 可达性
  const unreachable = ids.filter((id) => !reachable.has(id))
  if (unreachable.length) {
    gaps.push({
      kind: 'unreachable',
      severity: 'high',
      message: `有 ${unreachable.length} 个知识点从任何起点都学不到（前置链接不上，学习顺序断了）`,
      conceptNames: unreachable.map((id) => nameOf.get(id) ?? id).slice(0, 6),
    })
    score -= Math.min(24, 12 * unreachable.length)
  }

  // ③ 平铺一层（不是台阶式路径）
  if (ids.length >= FLAT_TRUNK_MIN_LEAVES && levels < MIN_LEVELS) {
    gaps.push({
      kind: 'flat-trunk',
      severity: 'high',
      message: `只有 ${levels} 层、${ids.length} 个知识点平铺在一起——缺"从基础到前沿"的台阶，需要补中间层次的概念`,
    })
    score -= 15
  }

  // ④ 起点直接汇入同一概念（往往缺中间台阶）
  const funnels: string[] = []
  for (const id of ids) {
    const srcs = edges.filter((e) => e.target === id).map((e) => e.source)
    const entryFed = srcs.filter((s) => (incoming.get(s) ?? 0) === 0).length
    if (entryFed >= FUNNEL_MIN_ENTRY_FED && (level.get(id) ?? 0) >= FUNNEL_MIN_LEVEL) {
      funnels.push(nameOf.get(id) ?? id)
    }
  }
  if (funnels.length) {
    gaps.push({
      kind: 'funnel',
      severity: 'medium',
      message: `有 ${funnels.length} 个知识点由多个"起点概念"直接汇入——中间往往缺过渡台阶（如 张量 → 自动微分 之间应有「导数与链式法则」这类概念）`,
      conceptNames: funnels.slice(0, 6),
    })
    score -= Math.min(12, 6 * funnels.length)
  }

  // ⑤ 声明了前置但没落成边
  const declaredOnly: string[] = []
  for (const c of leaves) {
    const declared = (c.attrs as { prerequisites?: unknown } | null)?.prerequisites
    if (!Array.isArray(declared) || declared.length === 0) continue
    const graphNames = edges
      .filter((e) => e.target === c.id)
      .map((e) => nameOf.get(e.source) ?? '')
    const pending = declared.map((d) => String(d)).filter((d) => d && !graphNames.includes(d))
    if (pending.length) declaredOnly.push(`${c.name}（${pending.join('、')}）`)
  }
  if (declaredOnly.length) {
    gaps.push({
      kind: 'declared-only',
      severity: 'medium',
      message: `有 ${declaredOnly.length} 个知识点的前置只有声明、没有落成前置边（顺序不生效）`,
      conceptNames: declaredOnly.slice(0, 5),
    })
    score -= Math.min(15, 5 * declaredOnly.length)
  }

  // ⑥ 讲义交付率
  const missingLessons = ids.length - lessons
  if (missingLessons > 0) {
    const ratio = missingLessons / ids.length
    gaps.push({
      kind: 'no-lesson',
      severity: 'medium',
      message: `${missingLessons}/${ids.length} 个知识点还没有讲义（骨架有了、内容没跟上）`,
      conceptNames: leaves.filter((c) => !c.cardId).map((c) => c.name).slice(0, 6),
    })
    score -= Math.round(ratio * 20)
  }

  // ⑦ 粒度太粗（"整块领域/方向"当知识点、或把整个空间名当知识点、或一句话当概念名）
  const spaceName = String(input.spaceName ?? '').trim()
  const coarse = leaves
    .filter((c) => {
      const name = c.name.trim()
      if (name.length >= LONG_NAME_LEN) return true
      if (COARSE_NAME_RE.test(name)) return true
      // 概念名与空间名相同/互相包含 → "把整个领域当成了一个知识点"
      if (spaceName && (name === spaceName || name.includes(spaceName) || spaceName.includes(name))) return true
      return false
    })
    .map((c) => c.name)
  if (coarse.length) {
    gaps.push({
      kind: 'coarse',
      severity: 'medium',
      message: `有 ${coarse.length} 个知识点粒度太粗（像"整块领域/方向"而不是"学完能做一件具体小事"）——需要拆细`,
      conceptNames: coarse.slice(0, 6),
    })
    score -= Math.min(10, 5 * coarse.length)
  }

  // ⑧ 分支结构（只有领域根目录）
  if (groups.length <= 1 && ids.length >= 6) {
    gaps.push({
      kind: 'flat-branches',
      severity: 'medium',
      message: `只有 ${groups.length} 个目录、${ids.length} 个知识点平铺在根层——建议按分支归类（目录结构也是体系的一部分）`,
    })
    score -= 8
  }

  // ⑨ 主题前置要求未声明
  if (!(input.spacePrereqs ?? []).length) {
    gaps.push({
      kind: 'no-space-prereq',
      severity: 'medium',
      message: '主题学习前置要求还没声明（学这个领域之前需要具备什么、需不需要自备）',
    })
    score -= 8
  }

  score = Math.max(0, Math.min(100, score))
  const summary =
    ids.length === 0
      ? '地图完整度 0/100：还没有任何知识点（先做一次起步研究或手工建点）'
      : `地图完整度 ${score}/100（知识点 ${ids.length} · 前置边 ${edges.length} · 学习路径 ${levels} 层 · 已建讲义 ${lessons}/${ids.length}）；缺口 ${gaps.length} 类`

  return {
    score,
    metrics: {
      leaves: ids.length,
      groups: groups.length,
      edges: edges.length,
      verifiedEdges: edges.filter((e) => e.verified).length,
      entries: entryIds.length,
      levels,
      lessons,
    },
    gaps,
    summary,
  }
}

/**
 * 生成「地图完整度」快照简报（注入研究会话，供模型按缺口补全）。
 * 只给结论与缺口清单，不给原始图数据（图数据由其他快照段落承载）。
 */
export function mapCoverageBriefing(coverage: MapCoverageResult, maxGaps = 8): string[] {
  if (coverage.metrics.leaves === 0) {
    return [`【地图完整度】${coverage.summary}`]
  }
  const lines = [
    `【地图完整度】${coverage.summary}`,
    `- 入口概念 ${coverage.metrics.entries} 个 · 学习路径 ${coverage.metrics.levels} 层 · 前置边 ${coverage.metrics.edges} 条（已确认 ${coverage.metrics.verifiedEdges}）`,
  ]
  if (coverage.gaps.length === 0) {
    lines.push('- 未发现结构性缺口（继续保持：新增概念必须给 prerequisites 并落成前置边）')
    return lines
  }
  lines.push('- 缺口清单（按严重度排序，补全时优先处理 high）：')
  const ordered = [...coverage.gaps].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))
  for (const g of ordered.slice(0, maxGaps)) {
    const names = g.conceptNames?.length ? `（涉及：${g.conceptNames.join('、')}）` : ''
    lines.push(`  · [${g.severity}] ${g.message}${names}`)
  }
  return lines
}
