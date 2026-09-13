/**
 * 诊断：两个文档的章节可提取性（不落库、不生成摘要，零 LLM 成本）
 * 1) 解析出的 markdown 里各层级标题数量（# ~ ######）
 * 2) StructureDetector 检测到的 sections 数与标题样本
 */
import { extractTextFromFile } from '../src/core/utils/extract-text'
import { StructureDetector } from '../src/core/platform/services/chunk-splitter/structure-detector'
import { performance } from 'node:perf_hooks'

const DOCS = [
  {
    label: '深度学习 epub',
    file: 'C:/Users/daoge/the-bot/knowledge-base/3dca5cae-8c6f-4bb6-bfa5-bc829df90f5d/documents/69f415bc-0c62-43f8-a4e5-67eafeb44750.epub',
    type: 'epub' as const,
  },
  {
    label: 'numpy-user.pdf',
    file: 'C:/Users/daoge/the-bot/knowledge-base/3dca5cae-8c6f-4bb6-bfa5-bc829df90f5d/documents/97087ac1-b5ca-4b65-b3d9-d6287c2427c6.pdf',
    type: 'pdf' as const,
  },
]

async function main(): Promise<void> {
  for (const d of DOCS) {
    const t0 = performance.now()
    const md = await extractTextFromFile(d.file, d.type, { asMarkdown: true })
    const parseMs = performance.now() - t0

    const levels: Record<number, number> = {}
    for (const line of md.split('\n')) {
      const m = /^(#{1,6})\s+/.exec(line)
      if (m) levels[m[1].length] = (levels[m[1].length] ?? 0) + 1
    }
    const structure = new StructureDetector().detect(md)

    console.log(`\n===== ${d.label} =====`)
    console.log(`解析 ${parseMs.toFixed(0)}ms | md ${md.length} 字符`)
    console.log(`markdown 标题层级分布:`, JSON.stringify(levels))
    console.log(`检测结果: hasStructure=${structure.hasStructure} type=${structure.structureType} sections=${structure.sections.length}`)
    console.log('章节样本（前 15）:')
    structure.sections.slice(0, 15).forEach((s, i) => {
      console.log(`  ${i}. [L${s.level}] ${s.title.slice(0, 56)}${s.parentTitle ? '  (父: ' + s.parentTitle.slice(0, 20) + ')' : ''}`)
    })
    const lv: Record<number, number> = {}
    for (const s of structure.sections) lv[s.level] = (lv[s.level] ?? 0) + 1
    console.log('章节层级分布:', JSON.stringify(lv))
  }
  process.exit(0)
}
setTimeout(() => { void main() }, 100)