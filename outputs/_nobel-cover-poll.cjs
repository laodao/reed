const fs = require('fs')
const { chromium } = require('playwright')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('renderer'))
  for (let i = 0; i < 50; i++) {
    const st = await page.evaluate(async (tid) => window.electronAPI.image.getTaskStatus(tid), 'sync_1791550419142')
    const d = st?.data ?? {}
    if (i % 3 === 0) log(`状态 ${d.status} ${JSON.stringify(d).slice(80, 200)}`)
    if (['completed', 'success', 'succeeded'].includes(d.status)) {
      fs.writeFileSync('outputs/_nobel-cover-task.json', JSON.stringify(d, null, 1), 'utf-8')
      log('完成: ' + JSON.stringify(d).slice(0, 500))
      break
    }
    if (['failed', 'error'].includes(d.status)) { console.error('失败: ' + JSON.stringify(d).slice(0, 400)); process.exit(1) }
    await sleep(5000)
  }
})().catch(e => { console.error('❌', e.message); process.exit(1) })
