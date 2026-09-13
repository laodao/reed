const { chromium } = require('playwright-core')
const fs = require('fs')

const RUN_ID = process.argv[2]
const OUT = process.argv[3] || 'C:/Users/daoge/code/project/the-bot/progress/_run_dump.json'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const contexts = browser.contexts()
  const page = contexts[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const r = await page.evaluate((runId) => window.electronAPI.workflow.getRun(runId), RUN_ID)
  fs.writeFileSync(OUT, JSON.stringify(r, null, 2), 'utf-8')
  // 概要
  const d = r?.data || {}
  const show = {
    success: r?.success,
    status: d.status,
    error: d.error,
    skipReason: d.skipReason,
    finishedAt: d.finishedAt,
    durationMs: d.durationMs,
    nodeRuns: Array.isArray(d.nodeRuns) ? d.nodeRuns.map(n => ({
      nodeId: n.nodeId, type: n.nodeType, name: n.nodeName, status: n.status,
      error: n.error, output: n.output,
    })) : undefined,
  }
  console.log(JSON.stringify(show, null, 2))
  await browser.close()
}

main().catch(e => { console.error(e); process.exit(1) })
