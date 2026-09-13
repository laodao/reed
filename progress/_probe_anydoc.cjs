// 实测 @firecrawl/anydoc：Electron 内置 Node 下加载 + 真实 EPUB 解析质量（章节标题/段落分隔）
const fs = require('fs')

const minibook = 'tests/unit/core/utils/fixtures/minibook.epub'
const deepBook = 'C:/Users/daoge/the-bot/knowledge-base/3dca5cae-8c6f-4bb6-bfa5-bc829df90f5d/documents/69f415bc-0c62-43f8-a4e5-67eafeb44750.epub'

console.log('[probe] node 版本:', process.version)
;(async () => {
try {
  const anydoc = require('@firecrawl/anydoc')
  const fns = Object.keys(anydoc).filter(k => typeof anydoc[k] === 'function')
  console.log('[probe] anydoc 加载成功, 导出:', fns.join(', '))

  for (const [label, p] of [['minibook.epub(夹具)', minibook], ['深度学习.epub(33MB真实书)', deepBook]]) {
    const buf = fs.readFileSync(p)
    console.log(`\n===== ${label} (${(buf.length / 1024 / 1024).toFixed(1)}MB) =====`)
    const t0 = Date.now()
    let md
    try {
      md = await anydoc.toMarkdownBytes(buf)
    } catch (e) {
      console.log('[probe] 失败:', e.code, e.message)
      continue
    }
    console.log('[probe] 耗时:', Date.now() - t0, 'ms | markdown 长度:', md.length)
    console.log('[probe] 标题行(# 开头):', (md.match(/^#{1,6} /gm) || []).length)
    console.log('[probe] 段落空行(\\n\\n):', (md.match(/\n\n/g) || []).length)
    console.log('--- 前 1200 字符 ---')
    console.log(md.slice(0, 1200))
  }
} catch (e) {
  console.log('[probe] 加载失败:', e.message)
  if (e.stack) console.log(e.stack.split('\n').slice(0, 6).join('\n'))
}
})()