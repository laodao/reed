/**
 * 订阅匹配规则（纯函数，双端同源）
 * @module core/services/event-system/event-matcher
 * @description 设计规格：10-event-system.md §5.2。
 *              types 元素以 '*' 结尾按前缀匹配，否则全等；'*' 匹配一切；
 *              聚合过滤两个字段都给定时为 AND。
 *              与现有触发器等值过滤正交（触发器的 match 逻辑不变）。
 */

import type { PlatformEventAggregate, SubscriptionFilter } from '@shared/types/event.types'

/** 单个类型模式匹配：'*' 全量；'前缀*' 前缀；其余全等 */
export function matchTypePattern(pattern: string, type: string): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith('*')) return type.startsWith(pattern.slice(0, -1))
  return pattern === type
}

/** 事件是否命中订阅过滤（types OR；aggregate AND；types 空数组 = 不匹配任何事件） */
export function matchesFilter(
  filter: SubscriptionFilter,
  event: { type: string; aggregate: PlatformEventAggregate }
): boolean {
  if (!filter.types || filter.types.length === 0) return false
  if (!filter.types.some(p => matchTypePattern(p, event.type))) return false
  const agg = filter.aggregate
  if (agg?.kind !== undefined && agg.kind !== event.aggregate.kind) return false
  if (agg?.id !== undefined && agg.id !== event.aggregate.id) return false
  return true
}
