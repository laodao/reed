// 探测 PDF 书签大纲（bookmark outline）是否存在及其规模
// 用法：node progress/_pdf_outline_probe.cjs <pdfPath>
const fs = require('fs')
const path = require('path')

const pdfPath = process.argv[2]
if (!pdfPath) {
  console.error('用法: node progress/_pdf_outline_probe.cjs <pdfPath>')
  process.exit(1)
}

const pdfjsPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'pdf-parse',
  'lib',
  'pdf.js',
  'v2.0.550',
  'build',
  'pdf.js',
)
const pdfjs = require(pdfjsPath)

async function main() {
  const data = new Uint8Array(fs.readFileSync(pdfPath))
  // 关闭 worker，便于在 Node 中直接跑
  const doc = await pdfjs.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise
  console.log('[pdf] pages =', doc.numPages)
  const outline = await doc.getOutline()
  if (!outline || !outline.length) {
    console.log('[outline] 无书签大纲')
    return
  }
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
  console.log('[outline] 前 40 条:')
  for (const f of flat.slice(0, 40)) {
    console.log(`${'  '.repeat(f.depth - 1)}[L${f.depth}] p${f.page} ${String(f.title).slice(0, 60)}`)
  }
  const byPage = flat.filter((f) => typeof f.page === 'number' && f.page > 0).length
  console.log(`[outline] 有页码定位的条目 = ${byPage}/${count}`)
  // 层级分布
  const dist = {}
  for (const f of flat) dist[f.depth] = (dist[f.depth] || 0) + 1
  console.log('[outline] 层级分布 =', JSON.stringify(dist))
}

main().catch((e) => {
  console.error('[outline] 失败:', e && e.message ? e.message : e)
  process.exit(1)
})
