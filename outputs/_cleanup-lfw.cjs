const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http') || p.url().includes('renderer'))
  const r = await page.evaluate(async () => {
    const list = await window.electronAPI.appSession.list('builtin_app_long_form_writing')
    const out = []
    for (const s of list.data ?? []) {
      out.push({ id: s.id, status: s.status })
      await window.electronAPI.appSession.delete(s.id)
    }
    return out
  })
  console.log('清理会话:', JSON.stringify(r, null, 1))
})().catch(e => { console.error(e.message); process.exit(1) })
