// 调试 4：numpy-user.pdf 书签大纲路径 vs 版面推断路径的标题结构对比
// 运行：npx tsx progress/_dbg_pdf_outline.ts
import { extractTextFromFile } from '../src/core/utils/extract-text'
import { readPdfOutline, mergeOutlineIntoMarkdown } from '../src/core/utils/pdf-outline'
import fs from 'node:fs'

const FILE =
  'C:/Users/daoge/the-bot/knowledge-base/3dca5cae-8c6f-4bb6-bfa5-bc829df90f5d/documents/97087ac1-b5ca-4b65-b3d9-d6287c2427c6.pdf'

/** 统计 Markdown 各级标题数量 */
function headingStats(md: string): Record<string, number> {
  const stats: Record<string, number> = {}
  for (const line of md.split('\n')) {
    const m = /^(#{1,6})\s+/.exec(line)
    if (m) stats[String(m[1].length)] = (stats[String(m[1].length)] || 0) + 1
  }
  return stats
}

async function main(): Promise<void> {
  const buffer = fs.readFileSync(FILE)

  const outline = await readPdfOutline(buffer)
  console.log('书签条目数:', outline.length)
  const perLevel: Record<number, number> = {}
  for (const e of outline) perLevel[e.level] = (perLevel[e.level] || 0) + 1
  console.log('书签层级分布:', JSON.stringify(perLevel))
  console.log('前 25 条书签:')
  for (const e of outline.slice(0, 25)) {
    console.log(`  ${'  '.repeat(e.level - 1)}[L${e.level}] p${e.pageIndex + 1} ${e.title}`)
  }

  const md = await extractTextFromFile(FILE, 'pdf', { asMarkdown: true })
  console.log('\n[大纲路径] 总字符:', md.length, '标题分布:', JSON.stringify(headingStats(md)))
  console.log('正文标题序列（前 40 个）:')
  const lines = md.split('\n').filter(l => /^#{1,6}\s/.test(l))
  lines.slice(0, 40).forEach((l, i) => console.log(`  ${i + 1}. ${l}`))

  // 内容保全校验：正文（去掉标题与空白）字符数 vs 逐页 Markdown
  const { extractPagesMarkdown } = await import('@firecrawl/pdf-inspector')
  const pages = extractPagesMarkdown(buffer).pages
  const rawChars = pages.reduce((n, p) => n + p.markdown.length, 0)
  const mdChars = md.length
  console.log(`\n内容量对比：逐页 Markdown ${rawChars} 字符 → 大纲切分后 ${mdChars} 字符（含标题）`)

  // 抽查：某个深层章节是否被正确切分
  const merged = mergeOutlineIntoMarkdown(
    pages.map(p => ({ pageIndex: p.page, markdown: p.markdown })),
    outline,
  )
  const sample = outline[Math.floor(outline.length / 2)]
  const idx = merged.indexOf(`# ${sample.title}`)
  console.log(`\n抽查中间位置章节「${sample.title}」(L${sample.level}, p${sample.pageIndex + 1}):`)
  console.log(idx >= 0 ? merged.slice(idx, idx + 220).replace(/\n/g, ' / ') : '  未找到该标题（按页插入，需检查）')
}

void main()
