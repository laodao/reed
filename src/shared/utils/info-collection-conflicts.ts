/**
 * 信息搜集：跨源数值冲突检测（纯函数，双端可用）
 * @module shared/utils/info-collection-conflicts
 *
 * 背景（主设计 §3 阶段 5 冲突归因）：两个来源对**同一指标、同一期间、同一维度**
 * 给出不同数值——先检测分组，归因（时点不同/口径不同/修订关系/真矛盾）由 LLM
 * 在服务层完成；本模块只做确定性的分组检测，不猜测归因。
 *
 * 口径：metric + period + dims 全等且 value 不同（value 均非空）→ 冲突候选组。
 * period/dims/metric 任一为空的行不参与（无法确认"同一数据点"）。
 */

import { dimsGroupKey } from './info-collection-checks'

export interface IcConflictRowInput {
  rowId: string
  sourceId: string
  schemaId: string
  metric: string | null
  period: string | null
  dims: Record<string, unknown> | null
  value: number | null
}

export interface IcValueConflictGroup {
  /** 分组键：`${schemaId}|${metric}|${period}|${dimsKey}` */
  key: string
  schemaId: string
  metric: string
  period: string
  dimsKey: string
  members: Array<{ rowId: string; sourceId: string; value: number }>
}

export function detectValueConflicts(rows: IcConflictRowInput[]): IcValueConflictGroup[] {
  const groups = new Map<string, IcValueConflictGroup>()
  for (const r of rows) {
    if (!r.metric || !r.period || r.value === null || r.value === undefined || Number.isNaN(r.value)) continue
    const dimsKey = dimsGroupKey(r.period, r.dims).split('|')[1] ?? ''
    const key = `${r.schemaId}|${r.metric}|${r.period}|${dimsKey}`
    let g = groups.get(key)
    if (!g) {
      g = { key, schemaId: r.schemaId, metric: r.metric, period: r.period, dimsKey, members: [] }
      groups.set(key, g)
    }
    g.members.push({ rowId: r.rowId, sourceId: r.sourceId, value: r.value })
  }
  const out: IcValueConflictGroup[] = []
  for (const g of groups.values()) {
    const distinct = new Set(g.members.map(m => m.value))
    if (distinct.size > 1) out.push(g)
  }
  // 确定性：按 key 排序
  out.sort((a, b) => (a.key < b.key ? -1 : 1))
  return out
}
