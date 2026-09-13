// 列出图片类资产（素材驱动用例准备）
const { chromium } = require('playwright-core')
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const expr = `window.electronAPI.assets.list({ page: 1, pageSize: 200 }).then(x => (x && x.success ? x.data : null))`
  const d = await p.evaluate(expr)
  const items = (d && d.items) || []
  const imgs = items.filter(a => a.kind === 'image' || a.category === 'image' || (a.mimeType || '').startsWith('image/'))
  console.log('total:', items.length, 'images:', imgs.length)
  for (const a of imgs.slice(0, 12)) {
    console.log([a.id, a.name, a.subCategory, a.mimeType].join(' | '))
  }
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
