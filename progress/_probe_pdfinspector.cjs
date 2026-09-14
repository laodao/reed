// 实测 @firecrawl/pdf-inspector：Electron 内置 Node 下加载 + 真实 PDF 解析质量
const fs = require('fs')
const path = require('path')

const pdfPath = 'C:/Users/daoge/the-bot/knowledge-base/3dca5cae-8c6f-4bb6-bfa5-bc829df90f5d/documents/97087ac1-b5ca-4b65-b3d9-d6287c2427c6.pdf'

console.log('[probe] node 版本:', process.version, '| platform:', process.platform, process.arch)
try {
  const inspector = require('@firecrawl/pdf-inspector')
  console.log('[probe] pdf-inspector 加载成功, 导出:', Object.keys(inspector).filter(k => typeof inspector[k] === 'function').join(', '))

  const buf = fs.readFileSync(pdfPath)
  console.log('[probe] pdf 大小:', buf.length, 'bytes')

  const t0 = Date.now()
  const result = inspector.processPdf(buf)
  console.log('[probe] 耗时:', Date.now() - t0, 'ms')
  console.log('[probe] pdfType:', result.pdfType)
  console.log('[probe] markdown 长度:', result.markdown ? result.markdown.length : null)
  if (result.markdown) {
    console.log('--- markdown 前 1600 字符 ---')
    console.log(result.markdown.slice(0, 1600))
    console.log('--- 段落空行数(\\n\\n 次数):', (result.markdown.match(/\n\n/g) || []).length)
    console.log('--- 标题行(# 开头)数:', (result.markdown.match(/^#{1,4} /gm) || []).length)
  }
} catch (e) {
  console.log('[probe] 加载/解析失败:', e.message)
  if (e.stack) console.log(e.stack.split('\n').slice(0, 6).join('\n'))
}