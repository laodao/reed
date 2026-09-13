// 查搜索引擎配置与默认项（CDP）
const { chromium } = require('playwright-core')
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const list = await page.evaluate(() => window.electronAPI.searchEngine.list().then(x => x))
  const items = list?.data ?? []
  console.log('配置数量:', items.length)
  for (const c of items) {
    console.log(`- id=${c.id} name=${c.name} template=${c.templateId} enabled=${c.isEnabled} isDefault=${c.isDefault}`)
  }
  const def = await page.evaluate(() => window.electronAPI.searchEngine.getDefault?.().then?.(x => x) ?? null).catch(() => null)
  console.log('getDefault():', JSON.stringify(def))
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
