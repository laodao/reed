// 补最后 1 条缺图行业周报（无历史渲染产物）：走 materialize-image 按 industryWeekly 模板现渲染成图片资产
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  // 检查 IPC 是否就绪（重启后 preload 生效）
  const has = await page.evaluate(() => !!window.electronAPI.assets.materializeImage)
  console.log('materializeImage API 就绪:', has)
  if (!has) { await browser.close(); return }

  const a = await page.evaluate(id => window.electronAPI.assets.get(id).then(r => (r.success ? r.data : { error: r.error })), 'asset_1787446016447_31qv41p5s')
  console.log('原资产:', a && a.name, '|', a && a.sourceRef)
  const t0 = Date.now()
  const r = await page.evaluate(p => window.electronAPI.assets.materializeImage(p).then(x => x), {
    assetId: 'asset_1787446016447_31qv41p5s',
    templateId: 'industryWeekly',
    subCategory: '行业周报长图',
    name: 'finance周报长图-',
    tags: ['周报', '长图'],
  })
  console.log('materialize 结果:', JSON.stringify(r).slice(0, 400), '| ms', Date.now() - t0)
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
