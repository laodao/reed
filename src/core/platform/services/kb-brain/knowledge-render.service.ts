/**
 * 知识渲染器（v3 M2/M3）：结构形态（树/表）→ agent 与人消费的 prompt-ready 文本。
 * @module platform/services/kb-brain/knowledge-render
 *
 * 原则：agent 永远消费文本渲染，不消费图本身；每层带属性槽与证据。
 */
import type { ParsedSystemTree } from './system-aggregate.service'

/** 体系树 → 缩进清单文本（structure-map 卡正文；层级按 order 排序） */
export function renderSystemTree(sys: ParsedSystemTree): string {
  const lines: string[] = [`> 体系「${sys.systemName}」· ${sys.nodes.length} 层 · 归纳置信 ${sys.confidence.toFixed(2)}（宁缺勿造：证据不足的层留空缺，不臆测）`, '']
  const ordered = [...sys.nodes].sort((a, b) => a.order - b.order)
  for (let i = ordered.length - 1; i >= 0; i--) {
    const n = ordered[i]!
    const indent = '  '.repeat(Math.min(i, 6))
    lines.push(`${indent}- **${n.name}**（第 ${n.order} 层）`)
    const attrs = Object.entries(n.attrs)
    if (attrs.length > 0) {
      lines.push(`${indent}  - ${attrs.map(([k, v]) => `${k}：${v}`).join('；')}`)
    }
    if (n.evidenceQuote) lines.push(`${indent}  - 证据：「${n.evidenceQuote}」`)
  }
  return lines.join('\n')
}
