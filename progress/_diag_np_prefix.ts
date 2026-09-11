// 诊断：numpy 大纲路径产出的 Markdown 里，文档开头（首个标题之前）到底是什么
// 运行：npx tsx progress/_diag_np_prefix.ts
import fs from 'node:fs'
import { extractPagesMarkdown } from '@firecrawl/pdf-inspector'
import { readPdfOutline, mergeOutlineIntoMarkdown } from '../src/core/utils/pdf-outline'

const FILE =
  'C:/Users/daoge/the-bot/knowledge-base/3dca5cae-8c6f-4bb6-bfa5-bc829df90f5d/documents/97087ac1-b5ca-4b65-b3d9-d6287c2427c6.pdf'

async function main(): Promise<void> {
  const buffer = fs.readFileSync(FILE)
  const outline = await readPdfOutline(buffer)
  const pages = extractPagesMarkdown(buffer).pages.map(p => ({ pageIndex: p.page, markdown: p.markdown }))
  const md = mergeOutlineIntoMarkdown(pages, outline)

  const firstHeading = md.search(/^#{1,6}\s/m)
  console.log('首个标题位置:', firstHeading)
  console.log('首个标题前的内容（前 400 字）:')
  console.log(JSON.stringify(md.slice(0, Math.min(400, firstHeading))))
  console.log('...')
  console.log('前 3 个标题:', md.split('\n').filter(l => /^#{1,6}\s/.test(l)).slice(0, 3))

  const at = md.indexOf('AtthecoreoftheNumPypackage')
  console.log('\n"AtthecoreoftheNumPypackage" 位置:', at, '（首个标题位置:', firstHeading, '）')
  const before = md.slice(Math.max(0, at - 300), at + 120)
  console.log('上下文:')
  console.log(JSON.stringify(before))
  // 最近的上级标题
  const headingRe = /^#{1,6}\s.*$/gm
  let last = null
  let m
  while ((m = headingRe.exec(md)) !== null && m.index < at) last = m[0]
  console.log('其前最近标题:', last)

  // 首 6 页各自的长度与前 60 字
  console.log('\n前 6 页:')
  for (const p of pages.slice(0, 6)) {
    console.log(`  p${p.pageIndex + 1} len=${p.markdown.length} :: ${p.markdown.replace(/\s+/g, ' ').slice(0, 70)}`)
  }
}

void main()
