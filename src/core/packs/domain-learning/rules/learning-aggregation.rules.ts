/**
 * 领域学习聚合纯函数（M4-A P1-3：收敛 graph/view 重复的树/统计/最新卡实现）
 * @module packs/domain-learning/rules/learning-aggregation.rules
 *
 * 历史:learning-graph.service 与 learning-view.service 各有一份 buildTree/stats,
 * 且 graph 版 children 按 createdAt 排序、view 版未排序——双实现已漂移(P1-3)。
 * 现收口为单一纯实现:树/统计/每概念最新卡;调用方以参数表达排序契约。
 */

import type { DlTreeNode } from '@shared/types/domain-learning.types'

export interface AggConceptShape {
  id: string
  parentId: string | null
  nodeType: string
  name: string
  mastery?: string
  /** 排序键(children 序;可选) */
  createdAt?: Date | null
}

export interface AggStatsShape {
  mastery?: string
  nodeType: string
}

/** 每概念最新版卡片(按 version 取最大) */
export function latestCardsByConcept<C extends { conceptId: string; version: number }>(
  cards: C[],
): Map<string, C> {
  const latest = new Map<string, C>()
  for (const card of cards) {
    const cur = latest.get(card.conceptId)
    if (!cur || card.version > cur.version) latest.set(card.conceptId, card)
  }
  return latest
}

/**
 * 概念树(group 为内层、概念为叶;顶层 parent=null)。
 * sortChildren: 按 createdAt 排序子级(原 graph 语义);不排则保持入参序(原 view 语义)。
 */
export function buildConceptTree(
  concepts: AggConceptShape[],
  opts: { sortChildren?: boolean } = {},
): DlTreeNode[] {
  const byParent = new Map<string | null, AggConceptShape[]>()
  for (const c of concepts) {
    const list = byParent.get(c.parentId) ?? []
    list.push(c)
    byParent.set(c.parentId, list)
  }
  const sort = (list: AggConceptShape[]): AggConceptShape[] =>
    opts.sortChildren
      ? list.slice().sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
      : list
  const build = (parentId: string | null): DlTreeNode[] =>
    sort(byParent.get(parentId) ?? []).map((c) =>
      c.nodeType === 'group'
        ? { id: c.id, name: c.name, children: build(c.id) }
        : { id: c.id, name: c.name, conceptId: c.id },
    )
  return build(null)
}

/** 掌握度统计(叶子=知识节点,group 不计) */
export function conceptStats(concepts: AggStatsShape[]): { total: number; mastered: number; learning: number } {
  const leaves = concepts.filter((c) => c.nodeType !== 'group')
  return {
    total: leaves.length,
    mastered: leaves.filter((c) => c.mastery === 'mastered').length,
    learning: leaves.filter((c) => c.mastery === 'learning').length,
  }
}
