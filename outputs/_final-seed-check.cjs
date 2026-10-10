const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('renderer'))
  const r = await page.evaluate(async () => {
    const def = await window.electronAPI.workflow.getDefinition?.('builtin_def_styled_long_form') ?? null
    const a = await window.electronAPI.app.get('builtin_app_styled_long_form')
    const desc = String(a?.data?.description ?? '')
    return {
      appOk: a?.success === true,
      hasVersionDesc: desc.includes('版本管理') || desc.includes('版本链'),
      descHead: desc.slice(0, 80),
    }
  })
  console.log(JSON.stringify(r, null, 1))
})().catch(e => { console.error(e.message); process.exit(1) })
