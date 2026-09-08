const { chromium } = require('@playwright/test')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
  const r = await page.evaluate(async () => {
    const res = await window.electronAPI.providerConfig.list()
    const out = []
    for (const c of (res.data || []).filter((x) => x.isEnabled)) {
      for (const m of c.models || []) {
        out.push({ cfg: c.name, id: m.id, name: m.name, features: m.features })
      }
    }
    return out
  })
  for (const m of r) console.log(`${m.cfg} | ${m.id} | features=${JSON.stringify(m.features)}`)
  process.exit(0)
})().catch((e) => { console.error(e.message); process.exit(1) })
