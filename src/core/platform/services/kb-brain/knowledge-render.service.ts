/**
 * 知识渲染器（v3 M2/M3）：结构形态（树/表）→ agent 与人消费的 prompt-ready 文本。
 * @module platform/services/kb-brain/knowledge-render
 *
 * 原则：agent 永远消费文本渲染，不消费图本身；每层带属性槽与证据。
 */
import type { ParsedSystemElement, ParsedRelation, SystemKind } from './system-aggregate.service'

/** 体系树 → 缩进清单文本（structure-map 卡正文；层级按 order 排序） */
export function renderSystemByKind(sys: {
  systemName: string
  kind: SystemKind
  confidence: number
  elements: ParsedSystemElement[]
  relations?: ParsedRelation[]
}): string {
  const kindLabel = KIND_LABEL_RENDER[sys.kind] ?? sys.kind
  const ordered = [...sys.elements].sort((a, b) => a.order - b.order)
  const lines: string[] = [`> 体系「${sys.systemName}」（${kindLabel}）· ${sys.elements.length} 个元素 · 归纳置信 ${sys.confidence.toFixed(2)}`, '']
  if (sys.kind === 'ladder') {
    lines.push(`**顺序链**：${ordered.map((el) => el.name).join(' → ')}`, '')
  }
  if (sys.kind === 'network' && sys.relations && sys.relations.length > 0) {
    lines.push('**成员关系**：', ...sys.relations.map((r) => `- ${r.from} —${r.type}— ${r.to}（${r.evidence}）`), '')
  }
  lines.push('**成员与属性**：', '')
  for (const el of ordered) {
    const pos = sys.kind === 'ladder' ? `（第 ${el.order} 层）` : ''
    lines.push(`- **${el.name}**${pos}`)
    for (const [k, v] of Object.entries(el.attrs)) lines.push(`  - ${k}：${v}`)
    if (el.evidenceQuote) lines.push(`  - 证据：「${el.evidenceQuote}」`)
  }
  return lines.join('\n')
}

const KIND_LABEL_RENDER: Record<string, string> = {
  ladder: '等级阶梯',
  tree: '层级结构',
  catalog: '成员清单',
  network: '关系网络',
}


