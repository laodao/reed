/**
 * 上下文压缩 + forcedContext 应用（步骤1 新增）
 * @module core/services/longwriting/context/context-compressor
 *
 * 超预算时按优先级从低到高压缩（spec §5.6）；forcedContext 最后应用（覆盖 included/content）。
 */

import type { ContextSection, ContextItem, ForcedContextItem, ContextPriority } from './context.types'
import { estimateTokens } from './context-token'

/** 背景摘要化的字符上限（超预算时 background content 截前 200 字） */
const BACKGROUND_SUMMARY_LIMIT = 200

/**
 * 应用 forcedContext 到 sections（include/exclude/edit）。
 * 优先级：forcedContext > builder 默认 > 预算压缩。
 * 在 compressToBudget 之前调用（forced include 的项不参与后续压缩）。
 */
export function applyForcedContext(
  sections: ContextSection[],
  forcedContext: ForcedContextItem[],
): Set<string> {
  const forcedIncludeIds = new Set<string>()
  const map = new Map(forcedContext.map((f) => [f.itemId, f]))

  for (const sec of sections) {
    for (const item of sec.items) {
      const f = map.get(item.id)
      if (!f) continue
      if (f.action === 'exclude') {
        item.included = false
      } else if (f.action === 'include') {
        item.included = true
        forcedIncludeIds.add(item.id)
      } else if (f.action === 'edit') {
        if (f.editedContent !== undefined) item.content = f.editedContent
        item.included = true
        forcedIncludeIds.add(item.id)
      }
    }
  }
  return forcedIncludeIds
}

/**
 * 按优先级 + token 预算压缩 sections（返回新数组，原数组不变）。
 *
 * 策略（priority 1最高-11最低）：
 * - priority 1-4（必留）：全量保留 included
 * - 超预算时从低到高压缩（11→10→8→6）：
 *   - 11（minor memory）：included=false
 *   - 10（background）：content 截前 200 字
 *   - 8（vector history）：减 items（included=false 从低分开始）
 *   - 6（normal memory）：按 score 截断（低分先 excluded）
 * - forcedIncludeIds 的项不参与压缩
 *
 * @param forcedIncludeIds forcedContext include 的 item id 集合（不压缩）
 */
export function compressToBudget(
  sections: ContextSection[],
  budget: number,
  forcedIncludeIds: Set<string> = new Set(),
): ContextSection[] {
  // 深拷贝避免改原数组
  const result: ContextSection[] = sections.map((sec) => ({
    ...sec,
    items: sec.items.map((it) => ({ ...it })),
  }))

  let used = sumTokens(result)

  if (used <= budget) return result

  // 压缩优先级顺序（从低到高）：11, 10, 8, 6
  const compressOrder: ContextPriority[] = [11, 10, 8, 6]

  for (const prio of compressOrder) {
    if (used <= budget) break
    const prioSections = result.filter((s) => s.priority === prio)
    for (const sec of prioSections) {
      if (used <= budget) break
      // priority 11 / 8 / 6: 丢弃 items（从低分/低价值开始）
      if (prio === 11 || prio === 8 || prio === 6) {
        // 按 score 升序排（低分先丢）
        const sortedItems = [...sec.items]
          .filter((it) => it.included && !forcedIncludeIds.has(it.id))
          .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
        for (const item of sortedItems) {
          if (used <= budget) break
          item.included = false
          used -= estimateTokens(item.content)
        }
      }
      // priority 10: 摘要化（content 截前 200 字）
      else if (prio === 10) {
        for (const item of sec.items) {
          if (used <= budget) break
          if (!item.included || forcedIncludeIds.has(item.id)) continue
          if (item.content.length > BACKGROUND_SUMMARY_LIMIT) {
            const before = estimateTokens(item.content)
            item.content = item.content.slice(0, BACKGROUND_SUMMARY_LIMIT) + '…'
            used += estimateTokens(item.content) - before
          }
        }
      }
    }
  }

  // 仍超预算：从 priority 7/5/9 继续丢（中低优先级兜底）
  if (used > budget) {
    const fallbackOrder: ContextPriority[] = [9, 7, 5]
    for (const prio of fallbackOrder) {
      if (used <= budget) break
      const prioSections = result.filter((s) => s.priority === prio)
      for (const sec of prioSections) {
        if (used <= budget) break
        const sortedItems = [...sec.items]
          .filter((it) => it.included && !forcedIncludeIds.has(it.id))
          .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
        for (const item of sortedItems) {
          if (used <= budget) break
          item.included = false
          used -= estimateTokens(item.content)
        }
      }
    }
  }

  // 重新核算各 section tokenEstimate
  for (const sec of result) {
    sec.tokenEstimate = sec.items.reduce(
      (acc, it) => acc + (it.included ? estimateTokens(it.content) : 0),
      0,
    )
  }

  return result
}

function sumTokens(sections: ContextSection[]): number {
  return sections.reduce(
    (acc, sec) => acc + sec.items.reduce((a, it) => a + (it.included ? estimateTokens(it.content) : 0), 0),
    0,
  )
}
