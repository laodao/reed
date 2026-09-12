// 用 pdfjs-dist 读取 PDF 书签大纲（评审用；正式实现见 src/core/utils/pdf-outline.ts）
// 用法：node progress/_pdf_outline_probe2.cjs <pdfPath>
const fs = require('fs')

const pdfPath = process.argv[2]

async function main() {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
  const data = new Uint8Array(fs.readFileSync(pdfPath))
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false }).promise
  console.log('[pdf] pages =', doc.numPages)
  const outline = await doc.getOutline()
  if (!outline || !outline.length) return console.log('[outline] 无书签大纲')
  let count = 0
  const flat = []
  const walk = async (items, depth) => {
    for (const it of items) {
      count++
      let page = null
      try {
        const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest
        if (dest && dest[0]) page = (await doc.getPageIndex(dest[0])) + 1
      } catch (e) {
        page = 'ERR:' + e.message
      }
      flat.push({ depth, title: it.title, page })
      if (it.items?.length) await walk(it.items, depth + 1)
    }
  }
  await walk(outline, 1)
  console.log('[outline] 条目数 =', count)
  for (const f of flat.slice(0, 12)) {
    console.log(`${'  '.repeat(f.depth - 1)}[L${f.depth}] p${f.page} ${String(f.title).slice(0, 60)}`)
  }
  const dist = {}
  for (const f of flat) dist[f.depth] = (dist[f.depth] || 0) + 1
  console.log('[outline] 层级分布 =', JSON.stringify(dist))
}

main().catch((e) => {
  console.error('[outline] 失败:', e && e.message ? e.message : e)
  process.exit(1)
})
