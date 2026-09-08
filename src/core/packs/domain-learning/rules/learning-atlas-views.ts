/**
 * Atlas 增强视图派生规则（M2-E；纯函数便于 TDD）
 * @module packs/domain-learning/rules/learning-atlas-views
 *
 * 按画像侧重（profile.emphasis 展示词）与数据可用性（available）计算 Atlas
 * 增强视图（时间线/流程/矩阵/三层结构）的启用集与派生数据。软规则（design-v3 §16.5）：
 * - 侧重词经 DL_EMPHASIS_VIEW_ALIASES 宽容映射到视图种类；无侧重/自定义 → 跟随
 *   available（有多少给多少，不锁死）；
 * - enabled = 侧重映射 ∩ available；时间线依赖 attrs 时间类键，流程依赖前置依赖边，
 *   矩阵依赖关系计数，三层结构 = 目录/概念/卡片三层总可派生（有概念即可）。
 */

import type {
  DlAtlasViewKind,
  DlAtlasViews,
  DlFlowStage,
  DlLayersConcept,
  DlLayersGroup,
  DlTimelineViewItem,
} from '@shared/types/domain-learning.types'
import { DL_EMPHASIS_VIEW_ALIASES } from '@shared/types/domain-learning.types'

/** 派生入参（服务层从 dl_* 仓储映射后传入，隔离数据库） */
export interface AtlasViewInputConcept {
  id: string
  name: string
  nodeType: string
  parentId: string | null
  mastery?: string
  desc?: string | null
  attrs?: Record<string, unknown> | null
  /** 卡片是否存在（已发布或草稿）；有卡才有著作层 */
  card?: { version: number; status: string; worksCount: number } | null
}

export interface AtlasViewInputRelation {
  source: string
  target: string
  relationType: string
  verified: boolean
}

export interface AtlasViewInputProfile {
  kindLabel?: string
  nature?: string
  /** 画像侧重展示词（如「时间线」「流程」） */
  emphasis?: string[]
}

export interface AtlasViewInput {
  concepts: AtlasViewInputConcept[]
  relations: AtlasViewInputRelation[]
  profile?: AtlasViewInputProfile | null
}

/** attrs 时间类键候选（宽容：命中的首个非空值即时间锚点） */
const TIME_ATTR_KEYS = [
  'year', 'date', 'time', '年份', '日期', '时间',
  'publishedYear', 'published_year', 'publishYear', '施行', '生效', '施行日期', '生效日期',
]

/** 从 attrs 提取时间锚点；解析不到返回 null */
function extractTimeAnchor(attrs: Record<string, unknown> | null | undefined): { dateText: string; year: number | null } | null {
  if (!attrs) return null
  for (const key of TIME_ATTR_KEYS) {
    const v = attrs[key]
    if (v === undefined || v === null || v === '') continue
    const text = String(v).trim()
    if (!text) continue
    const m = text.match(/-?\d{4}/)
    return { dateText: text, year: m ? Number(m[0]) : null }
  }
  return null
}

/** 时间线：节点按年份（无年份按 name 稳定序）升序 */
function deriveTimeline(concepts: AtlasViewInputConcept[], groupNameOf: Map<string, string>): DlTimelineViewItem[] {
  const items: DlTimelineViewItem[] = []
  for (const c of concepts) {
    if (c.nodeType === 'group') continue
    const anchor = extractTimeAnchor(c.attrs)
    if (!anchor) continue
    items.push({
      id: c.id,
      name: c.name,
      nodeType: c.nodeType,
      group: c.parentId ? (groupNameOf.get(c.parentId) ?? c.parentId) : null,
      dateText: anchor.dateText,
      year: anchor.year,
      desc: c.desc ?? null,
      attrs: c.attrs ?? null,
    })
  }
  items.sort((a, b) => {
    const ya = a.year ?? Number.MAX_SAFE_INTEGER
    const yb = b.year ?? Number.MAX_SAFE_INTEGER
    return ya !== yb ? ya - yb : a.name.localeCompare(b.name, 'zh')
  })
  return items
}

/** 流程：prerequisite 关系子图按拓扑层分组（同层可并行） */
function deriveFlow(concepts: AtlasViewInputConcept[], relations: AtlasViewInputRelation[]): { stages: DlFlowStage[]; sourceIds: string[]; sinkIds: string[] } | null {
  const nodes = new Set(concepts.filter((c) => c.nodeType !== 'group').map((c) => c.id))
  const prereq = relations.filter((r) => r.relationType === 'prerequisite' && nodes.has(r.source) && nodes.has(r.target))
  if (prereq.length === 0) return null

  const outOf = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const id of nodes) {
    outOf.set(id, [])
    inDegree.set(id, 0)
  }
  for (const e of prereq) {
    outOf.get(e.source)!.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  }
  // 参与流程的节点（有入度或出度）
  const involved = new Set<string>()
  for (const e of prereq) {
    involved.add(e.source)
    involved.add(e.target)
  }
  const queue: string[] = []
  for (const id of involved) {
    if ((inDegree.get(id) ?? 0) === 0) queue.push(id)
  }
  const level = new Map<string, number>()
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    const lv = level.get(cur) ?? 0
    for (const next of outOf.get(cur) ?? []) {
      const nd = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, nd)
      level.set(next, Math.max(level.get(next) ?? 0, lv + 1))
      if (nd === 0) queue.push(next)
    }
  }
  if (queue.length === 0) return null // 存在环且无入口（数据异常兜底）
  const byLevel = new Map<number, string[]>()
  for (const id of involved) {
    const lv = level.get(id) ?? 0
    const list = byLevel.get(lv) ?? []
    list.push(id)
    byLevel.set(lv, list)
  }
  const stages: DlFlowStage[] = [...byLevel.keys()]
    .sort((a, b) => a - b)
    .map((order) => ({ order, conceptIds: byLevel.get(order)!.slice().sort() }))
  const sourceIds = [...involved].filter((id) => [...prereq].every((e) => e.target !== id))
  const sinkIds = [...involved].filter((id) => [...prereq].every((e) => e.source !== id))
  return { stages, sourceIds: sourceIds.sort(), sinkIds: sinkIds.sort() }
}

/** 矩阵：nodeType × relationType 边计数（行 = 边起点类型；起点非知识节点时取终点） */
function deriveMatrix(concepts: AtlasViewInputConcept[], relations: AtlasViewInputRelation[]): { nodeTypes: string[]; relationTypes: string[]; cells: Record<string, Record<string, number>> } | null {
  const typeOf = new Map<string, string>()
  for (const c of concepts) {
    if (c.nodeType !== 'group') typeOf.set(c.id, c.nodeType)
  }
  const cells: Record<string, Record<string, number>> = {}
  const nodeTypes = new Set<string>()
  const relationTypes = new Set<string>()
  for (const e of relations) {
    const rowType = typeOf.get(e.source) ?? typeOf.get(e.target)
    if (!rowType) continue // 边两端都不是知识节点（纯 group 边）→ 不计
    nodeTypes.add(rowType)
    relationTypes.add(e.relationType)
    cells[rowType] ??= {}
    cells[rowType][e.relationType] = (cells[rowType][e.relationType] ?? 0) + 1
  }
  if (relationTypes.size === 0) return null
  return { nodeTypes: [...nodeTypes].sort(), relationTypes: [...relationTypes].sort(), cells }
}

/** 三层结构：目录 group（L1）→ 概念（L2）→ 卡片/著作（L3 计数） */
function deriveLayers(concepts: AtlasViewInputConcept[]): { groups: DlLayersGroup[] } {
  const groups = new Map<string, DlLayersGroup>()
  const root: DlLayersGroup = { groupId: null, groupName: null, concepts: [] }
  for (const c of concepts) {
    if (c.nodeType === 'group') {
      groups.set(c.id, { groupId: c.id, groupName: c.name, concepts: [] })
      continue
    }
    const concept: DlLayersConcept = {
      id: c.id,
      name: c.name,
      nodeType: c.nodeType,
      hasCard: !!c.card,
      worksCount: c.card?.worksCount ?? 0,
    }
    if (c.parentId && groups.has(c.parentId)) {
      groups.get(c.parentId)!.concepts.push(concept)
    } else {
      root.concepts.push(concept)
    }
  }
  const out = [...groups.values()].filter((g) => g.concepts.length > 0 || true)
  out.sort((a, b) => (a.groupName ?? '').localeCompare(b.groupName ?? '', 'zh'))
  if (root.concepts.length > 0) out.unshift(root)
  return { groups: out }
}

/** 侧重词 → 视图种类（宽容匹配：包含任意别名即命中） */
function emphasisKinds(emphasis: string[] | undefined): Set<DlAtlasViewKind> {
  const kinds = new Set<DlAtlasViewKind>()
  for (const word of emphasis ?? []) {
    for (const [kind, aliases] of Object.entries(DL_EMPHASIS_VIEW_ALIASES) as [DlAtlasViewKind, string[]][]) {
      if (aliases.some((a) => word.includes(a))) kinds.add(kind)
    }
  }
  return kinds
}

/** 入口：计算启用集 + 各增强视图派生数据 */
export function buildAtlasViews(input: AtlasViewInput): DlAtlasViews {
  const { concepts, relations, profile } = input
  const groupNameOf = new Map<string, string>()
  for (const c of concepts) {
    if (c.nodeType === 'group') groupNameOf.set(c.id, c.name)
  }

  const timelineItems = deriveTimeline(concepts, groupNameOf)
  const timeline = timelineItems.length > 0 ? { items: timelineItems } : null
  const flow = deriveFlow(concepts, relations)
  const matrix = deriveMatrix(concepts, relations)
  const layers = deriveLayers(concepts)
  const hasAnyConcept = concepts.some((c) => c.nodeType !== 'group')
  const layersView = hasAnyConcept && layers.groups.length > 0 ? layers : null

  const available: DlAtlasViewKind[] = []
  if (timeline) available.push('timeline')
  if (flow) available.push('flow')
  if (matrix) available.push('matrix')
  if (layersView) available.push('layers')

  const wanted = emphasisKinds(profile?.emphasis)
  const enabled: DlAtlasViewKind[] =
    wanted.size > 0
      ? available.filter((k) => wanted.has(k))
      : [...available]

  return {
    spaceId: '',
    available,
    enabled,
    timeline,
    flow,
    matrix,
    layers: layersView,
  }
}
