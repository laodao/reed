const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  const sid = 'apps_1791542599274_mgtpvomro'
  const r = await page.evaluate(async (sid) => {
    const s = await window.electronAPI.appSession.get(sid)
    const m = await window.electronAPI.appSession.messages(sid)
    const cards = (m.data ?? []).map(x => ({ card: x.metadata?.sessionCard?.card, kind: x.metadata?.sessionCard?.kind, node: x.metadata?.sessionCard?.nodeId, status: x.metadata?.sessionCard?.status, at: x.createdAt, snippet: String(x.content ?? '').slice(0, 60) }))
    return { session: s.data, nCards: cards.length, last: cards.slice(-8) }
  }, sid)
  console.log(JSON.stringify(r, null, 1))
})().catch(e => { console.error(e.message); process.exit(1) })
