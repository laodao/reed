const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('renderer'))
  const r = await page.evaluate(async () => {
    const api = window.electronAPI.providerConfig
    const out = { methods: Object.keys(api) }
    if (api.get) { const g = await api.get('pc_mmuuwsf3q_kzesid6qr'); out.get = g?.success ? { name: g.data?.name, enabled: g.data?.enabled ?? g.data?.isEnabled } : g }
    if (api.testProvider) { try { const t = await api.testProvider({ providerConfigId: 'pc_mmuuwsf3q_kzesid6qr' }); out.test = JSON.stringify(t).slice(0, 200) } catch (e) { out.test = 'throw: ' + e.message } }
    return out
  })
  console.log(JSON.stringify(r, null, 1))
})().catch(e => { console.error(e.message); process.exit(1) })
