// 二次核实：image 大类全部资产（含子分类），及早报/周报是否存了 PNG；另抓取吃瓜长图的实际文件
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')

  // 1) image 大类：子分类聚合
  const subStats = await page.evaluate(() => window.electronAPI.assets.subCategoryStats('image').then(r => (r.success ? r.data : { error: r.error })))
  console.log('image 大类子分类统计:', JSON.stringify(subStats, null, 2))

  // 2) image 全量按名字扫：早报/周报 相关 PNG 是否存在
  for (const kw of ['早报', '周报']) {
    const r = await page.evaluate(k => window.electronAPI.assets.list({ category: 'image', keyword: k, page: 1, pageSize: 50 }).then(x => (x.success ? x.data : { error: x.error })), kw)
    console.log(`\nimage 含「${kw}」资产 total=${r && r.total}`)
    for (const a of (r && r.items) || []) {
      console.log(JSON.stringify({ id: a.id, name: a.name, kind: a.kind, subCategory: a.subCategory, storagePath: a.storagePath, sizeBytes: a.sizeBytes }))
    }
  }

  // 3) text 大类下全部子分类聚合（确认早报/周报/吃瓜报告只以文本形式存在 + 是否有别的子分类）
  const tStats = await page.evaluate(() => window.electronAPI.assets.subCategoryStats('text').then(r => (r.success ? r.data : { error: r.error })))
  console.log('\ntext 大类子分类统计:', JSON.stringify(tStats, null, 2))

  // 4) 抓取一张吃瓜长图真实文件，确认是落盘的 PNG
  const r2 = await page.evaluate(() => window.electronAPI.assets.list({ category: 'image', subCategory: '吃瓜长图', page: 1, pageSize: 1 }).then(x => (x.success ? x.data : { error: x.error })))
  const one = r2 && r2.items && r2.items[0]
  if (one) {
    const dl = await page.evaluate(id => window.electronAPI.assets.download ? undefined : undefined, one.id)
    const folder = await page.evaluate(id => window.electronAPI.assets.openFolder(id).then(r => r), one.id)
    console.log('\n吃瓜长图样例:', JSON.stringify({ id: one.id, name: one.name, storagePath: one.storagePath }, null, 2))
  }
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
