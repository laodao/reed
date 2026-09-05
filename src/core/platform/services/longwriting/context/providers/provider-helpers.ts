/**
 * Provider 共享 helper（步骤1 新增）
 * @module core/platform/services/longwriting/context/providers/provider-helpers
 */

import type { ContextItem, ContextSection, ContextPriority } from '../context.types'
import { estimateTokens } from '../context-token'

/**
 * 构造一个分区（自动核算 tokenEstimate）
 */
export function makeSection(
  key: string,
  title: string,
  priority: ContextPriority,
  items: ContextItem[],
): ContextSection {
  const tokenEstimate = items.reduce(
    (acc, it) => acc + (it.included ? estimateTokens(it.content) : 0),
    0,
  )
  return { key, title, priority, items, tokenEstimate }
}

/**
 * 构造一个上下文项（默认 included=true, editable=true）
 */
export function makeItem(partial: {
  id: string
  type: ContextItem['type']
  title: string
  summary: string
  content: string
  priority: ContextPriority
  source?: ContextItem['source']
  score?: number
  included?: boolean
  editable?: boolean
}): ContextItem {
  return {
    source: 'sql',
    included: true,
    editable: true,
    ...partial,
  }
}
