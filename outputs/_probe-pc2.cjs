const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('renderer'))
  const r = await page.evaluate(async () => {
    const api = window.electronAPI.providerConfig
    const l = await api.list()
    const items = (l.data ?? []).map(x => ({ id: x.id, name: x.name }))
    const g = await api.get('pc_mmyd3u5b_hkf5odex3')
    return { count: items.length, items, deepseekGet: g?.success === true ? 'ok' : (g?.error ?? '?') }
  })
  console.log(JSON.stringify(r, null, 1))
})().catch(e => { console.error(e.message); process.exit(1) })
