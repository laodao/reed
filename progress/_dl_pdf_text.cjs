/**
 * 用 pdfjs-dist 抽取导出 PDF 的文本，判断 mermaid 图是否渲染（应出现节点标签、不应出现 graph TD 源码）。
 * 用法：node progress/_dl_pdf_text.cjs [pdfPath]
 */
const path = require('path')

async function main() {
  const file = process.argv[2] || path.join(__dirname, '_dl_export_sample.pdf')
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
  const data = new Uint8Array(require('fs').readFileSync(file))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  console.log('页数:', doc.numPages)
  let all = ''
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    all += tc.items.map((i) => i.str).join('') + '\n'
  }
  console.log('文本长度:', all.length)
  console.log('含 "graph TD":', all.includes('graph TD'))
  console.log('含 "flowchart":', all.includes('flowchart'))
  console.log('含 "```":', all.includes('```'))
  for (const kw of ['金融资产', '原生资产', '衍生品', '股权', '债权', '商品', '外汇']) {
    console.log(`含 "${kw}":`, all.includes(kw))
  }
  const i = all.indexOf('graph TD')
  if (i >= 0) console.log('\n--- graph TD 附近文本 ---\n' + all.slice(Math.max(0, i - 120), i + 500))
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
