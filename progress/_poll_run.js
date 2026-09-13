const { chromium } = require('playwright-core')
const fs = require('fs')

const RUN_ID = process.argv[2]
const DURATION_MS = Number(process.argv[3] || 60000)

function summarize(d) {
  const nr = Array.isArray(d.nodeRuns) ? d.nodeRuns : []
  return {
    status: d.status,
    finishedAt: d.finishedAt,
    error: d.error,
    nodes: nr.map(n => `${n.nodeId}:${n.status}${n.error ? '(' + n.error.slice(0, 80) + ')' : ''}`).join(' | '),
  }
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const contexts = browser.contexts()
  const page = contexts[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')

  const t0 = Date.now()
  let last = ''
  while (Date.now() - t0 < DURATION_MS) {
    const r = await page.evaluate((runId) => window.electronAPI.workflow.getRun(runId), RUN_ID)
    const d = r?.data || {}
    const s = summarize(d)
    if (s !== last) {
      console.log('[' + new Date().toLocaleTimeString() + ']', s)
      last = s
    }
    if (d.status === 'succeeded' || d.status === 'failed' || d.status === 'cancelled') {
      fs.writeFileSync('C:/Users/daoge/code/project/the-bot/progress/_run_final.json', JSON.stringify(r, null, 2), 'utf-8')
      console.log('TERMINAL:', s)
      break
    }
    await new Promise(res => setTimeout(res, 4000))
  }
  await browser.close()
}

main().catch(e => { console.error(e); process.exit(1) })
