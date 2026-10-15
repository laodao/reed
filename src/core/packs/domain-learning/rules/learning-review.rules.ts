/**
 * 间隔复习候选规则（M3-B；纯函数便于 TDD）
 * @module packs/domain-learning/rules/learning-review.rules
 *
 * 语义（design-v3 §13「需复习」隔日回访 / §15 M3）：
 * - 候选 = 已理解（mastered/review）的知识概念（group 除外）且距「最近一次掌握确认/复习」
 *   超过复习间隔；
 * - 「最近一次掌握确认/复习」取 dl_mastery_log 中该概念最近一条以 mastered 为终点
 *   或 trigger∈复习类 的记录时间；无记录回落概念创建时间（新掌握从诞生算）；
 * - 到期排序按待复习最久者优先，limit 截断（一轮不超过 N 条，防风暴）。
 * 掌握度语义：本规则只产出候选与到期时间，不推进 mastery；推进仍走用户/assessor 反馈。
 */

import type { DlReviewSettings } from '@shared/types/domain-learning.types'
import { DEFAULT_DL_REVIEW_SETTINGS } from '@shared/types/domain-learning.types'

/** 归一化复习配置（行 DTO 已解析，这里兜底非法/缺失值） */
export function normalizeDlReviewSettings(raw: DlReviewSettings | null | undefined): DlReviewSettings {
  const base = { ...DEFAULT_DL_REVIEW_SETTINGS, ...(raw ?? {}) }
  return {
    enabled: !!base.enabled,
    intervalMin: typeof base.intervalMin === 'number' && base.intervalMin >= 1 ? Math.floor(base.intervalMin) : 1440,
    limit: typeof base.limit === 'number' && base.limit >= 1 ? Math.floor(base.limit) : 10,
  }
}

/** 复习类触发（audit 里表示一次"掌握确认/复习动作"） */
const REVIEW_TRIGGERS = new Set(['review', 'lesson_ack', 'self_test'])

export interface ReviewConceptRow {
  id: string
  name: string
  nodeType: string
  mastery: string
  createdAt: Date | null
  updatedAt: Date | null
}

export interface ReviewLogRow {
  conceptId: string
  trigger: string
  toMastery?: string | null
  at: Date | null
}

export interface ReviewCandidate {
  id: string
  name: string
  /** 距本次复习间隔开始的基准时间（最近掌握确认/复习 或 创建时间） */
  lastReviewedAt: Date
  /** 已逾期时长（ms；>0 = 到期） */
  overdueMs: number
}

/** 单概念最近掌握/复习时间；无记录回落 createdAt */
export function lastReviewTime(
  c: Pick<ReviewConceptRow, 'id' | 'createdAt'>,
  logs: ReviewLogRow[],
): Date {
  let last: Date | null = null
  for (const l of logs) {
    if (l.conceptId !== c.id || !l.at) continue
    const isMasteredEnd = l.toMastery === 'mastered'
    const isReviewTrigger = REVIEW_TRIGGERS.has(l.trigger)
    if (!isMasteredEnd && !isReviewTrigger) continue
    if (!last || l.at > last) last = l.at
  }
  return last ?? c.createdAt ?? new Date(0)
}

export interface ReviewSelectionOptions {
  /** 复习间隔（ms） */
  intervalMs: number
  /** 每轮最多条数 */
  limit: number
  /** 当前时刻 */
  now: Date
}

/** 到期候选：mastered/review 且逾期；按逾期最久排序，limit 截断 */
export function pickReviewCandidates(
  concepts: ReviewConceptRow[],
  logs: ReviewLogRow[],
  opts: ReviewSelectionOptions,
): ReviewCandidate[] {
  const due: ReviewCandidate[] = []
  for (const c of concepts) {
    if (c.nodeType === 'group') continue
    if (c.mastery !== 'mastered' && c.mastery !== 'review') continue
    const last = lastReviewTime(c, logs)
    const overdueMs = opts.now.getTime() - last.getTime()
    if (overdueMs < opts.intervalMs) continue
    due.push({ id: c.id, name: c.name, lastReviewedAt: last, overdueMs })
  }
  due.sort((a, b) => b.overdueMs - a.overdueMs)
  return due.slice(0, opts.limit)
}
