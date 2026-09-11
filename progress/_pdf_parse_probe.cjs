// 对比 pdf-inspector 各接口耗时与输出质量（评审用）
// 用法：node progress/_pdf_parse_probe.cjs <pdfPath>
const fs = require('fs')

const pdfPath = process.argv[2]

async function main() {
  const { classifyPdf, processPdf, extractPagesMarkdown } = require('@firecrawl/pdf-inspector')
  const buffer = fs.readFileSync(pdfPath)

  let t = Date.now()
  const cls = classifyPdf(buffer)
  console.log(`[classify] ${Date.now() - t}ms`, JSON.stringify(cls))

  t = Date.now()
  const res = processPdf(buffer)
  console.log(`[processPdf] ${Date.now() - t}ms markdown=${res.markdown?.length ?? 0} 字符, 标题行=${(res.markdown || '').split('\n').filter((l) => /^#{1,6}\s/.test(l)).length}`)

  t = Date.now()
  const pages = extractPagesMarkdown(buffer)
  const joined = pages.pages.map((p) => p.markdown).join('\n\n')
  console.log(`[extractPagesMarkdown] ${Date.now() - t}ms 页数=${pages.pages.length} 拼接=${joined.length} 字符, 标题行=${joined.split('\n').filter((l) => /^#{1,6}\s/.test(l)).length}`)
  console.log('[pages] 需要 OCR 的页 =', pages.pagesNeedingOcr.length, '表格页 =', pages.pagesWithTables.length, '分栏页 =', pages.pagesWithColumns.length)
  console.log('--- 第 7 页 markdown 前 600 字（0 索引 6）---')
  console.log((pages.pages[6]?.markdown || '').slice(0, 600))
}

main().catch((e) => {
  console.error('[probe] 失败:', e && e.message ? e.message : e)
  process.exit(1)
})
