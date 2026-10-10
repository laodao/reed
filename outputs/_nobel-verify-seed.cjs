const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('renderer'))
  const r = await page.evaluate(async () => {
    const a = await window.electronAPI.app.get('builtin_app_styled_long_form')
    return a?.success === true ? { ok: true, name: a.data.name, category: a.data.category } : { ok: false, raw: a }
  })
  console.log(JSON.stringify(r, null, 1))
})().catch(e => { console.error(e.message); process.exit(1) })
