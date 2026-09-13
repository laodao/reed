// 单条缺图周报：读资产内容（textContent）看是否完整，判断能否按 industryWeekly 模板重渲染
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const a = await page.evaluate(id => window.electronAPI.assets.get(id).then(r => (r.success ? r.data : { error: r.error })), 'asset_1787446016447_31qv41p5s')
  if (!a || a.error) { console.log('获取失败', a && a.error); await browser.close(); return }
  console.log('name:', a.name, '| subCategory:', a.subCategory, '| sourceRef:', a.sourceRef, '| kind:', a.kind)
  console.log('---- textContent 前 600 字 ----')
  console.log((a.textContent || '').slice(0, 600))
  console.log('---- 长度:', (a.textContent || '').length)
  // 找同 run 有无其它节点产物
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
