// 用正确参数验证默认搜索引擎（智谱）能否真正搜到
const { chromium } = require('playwright-core')
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const list = await page.evaluate(() => window.electronAPI.searchEngine.list().then(x => x))
  const cfg = (list?.data ?? []).find(c => c.isDefault) ?? (list?.data ?? [])[0]
  if (!cfg) { console.log('没有任何搜索配置'); await browser.close(); return }
  console.log('默认配置:', cfg.name, cfg.templateId, 'isDefault=', cfg.isDefault)

  const test = await page.evaluate((id) => window.electronAPI.searchEngine.test({ configId: id, query: 'TikTok Shop 入驻条件' }).then(x => x).catch(e => ({ success: false, error: String(e) })), cfg.id)
  console.log('testConfig:', JSON.stringify(test).slice(0, 500))

  const search = await page.evaluate((id) => window.electronAPI.searchEngine.search({ query: 'TikTok Shop 入驻条件', configId: id, maxResults: 5 }).then(x => x).catch(e => ({ success: false, error: String(e) })), cfg.id)
  const rs = search?.data?.results ?? search?.data ?? []
  console.log('searchResult: success=', search?.success, 'error=', search?.error, 'count=', Array.isArray(rs) ? rs.length : 0)
  if (Array.isArray(rs)) rs.slice(0, 3).forEach(r => console.log('  -', String(r.title ?? '').slice(0, 60), '|', String(r.url ?? '').slice(0, 70)))
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
