// pdf-inspector 多文档效果矩阵：中文技术书 / 英文小说 / 英文论文 / 中文合同 / 扫描件分类
const fs = require('fs')

const samples = [
  { label: '中文技术书 Happy-LLM', path: 'C:/Users/daoge/Documents/ai学习/Happy-LLM：从零开始的大语言模型原理与实践教程.pdf' },
  { label: '英文小说 SanTi', path: 'C:/Users/daoge/Documents/My Kindle Content/San Ti - Liu Ci Xin.pdf' },
  { label: '英文论文 arXiv', path: 'C:/Users/daoge/Downloads/2310.08560v2.pdf' },
  { label: '中文合同 PLM许可', path: 'C:/Users/daoge/Desktop/临时/2026年plm系统许可增购合同.pdf' },
]

const REPL = '\uFFFD'
function garbledRatio(s) {
  let n = 0
  for (const ch of s) if (ch === REPL) n++
  return n
}

console.log('[probe] node:', process.version)
const inspector = require('@firecrawl/pdf-inspector')
console.log('[probe] pdf-inspector 已加载\n')

for (const s of samples) {
  if (!fs.existsSync(s.path)) { console.log(`!! 缺失: ${s.path}`); continue }
  const buf = fs.readFileSync(s.path)
  let result
  try {
    const t0 = Date.now()
    result = inspector.processPdf(buf)
    const ms = Date.now() - t0
    const md = result.markdown || ''
    console.log(`===== ${s.label} (${(buf.length/1024/1024).toFixed(1)}MB) =====`)
    console.log(`pdfType: ${result.pdfType} | 耗时: ${ms}ms | markdown: ${md.length} 字符`)
    console.log(`标题行(#): ${(md.match(/^#{1,6} /gm)||[]).length} | 段落空行: ${(md.match(/\n\n/g)||[]).length} | 乱码字符: ${garbledRatio(md)}`)
    console.log(`--- 开头 500 字符 ---`)
    console.log(md.slice(0, 500).replace(/\n{3,}/g, '\n\n'))
    console.log(`--- 中段 400 字符 ---`)
    const mid = Math.floor(md.length / 2)
    console.log(md.slice(mid, mid + 400).replace(/\n{3,}/g, '\n\n'))
    console.log()
  } catch (e) {
    console.log(`===== ${s.label} =====`)
    console.log(`解析失败: code=${e.code} message=${e.message}`)
    console.log()
  }
}

// 扫描件分类（轻量，不提取）
const scanPath = 'C:/Users/daoge/Desktop/MouseWithoutBorders/扫描_20260105 (2).pdf'
if (fs.existsSync(scanPath)) {
  const buf = fs.readFileSync(scanPath)
  const t0 = Date.now()
  try {
    const det = inspector.detectPdf(buf)
    console.log(`===== 扫描件分类 =====\ndetectPdf: ${JSON.stringify(det)} | 耗时 ${Date.now()-t0}ms`)
    const t1 = Date.now()
    const r2 = inspector.processPdf(buf)
    console.log(`processPdf(扫描件): pdfType=${r2.pdfType} markdown=${r2.markdown ? r2.markdown.length : null} | 耗时 ${Date.now()-t1}ms`)
  } catch (e) {
    console.log(`扫描件处理: code=${e.code} message=${e.message}`)
  }
}