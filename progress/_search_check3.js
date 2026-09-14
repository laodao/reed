const { chromium } = require('playwright-core')
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const list = await p.evaluate(() => window.electronAPI.searchEngine.list().then(x => x))
  const cfg = (list?.data ?? []).find(c => c.isDefault)
  const r = await p.evaluate(({ q, engine, id }) => window.electronAPI.searchEngine.search({ query: q, engine, configId: id, maxResults: 5 }).then(x => x).catch(e => ({ success: false, error: String(e) })), { q: 'TikTok Shop 入驻条件 东南亚', engine: cfg.templateId, id: cfg.id })
  const rs = r?.data?.results ?? r?.results ?? []
  console.log('search success=', r?.success, 'error=', r?.error, 'count=', Array.isArray(rs) ? rs.length : 0)
  if (Array.isArray(rs)) rs.slice(0, 4).forEach(x => console.log('  -', String(x.title ?? '').slice(0, 70), '|', String(x.url ?? '').slice(0, 80)))
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
