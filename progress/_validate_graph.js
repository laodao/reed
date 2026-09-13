const { chromium } = require('playwright-core')
const fs = require('fs')

const raw = JSON.parse(fs.readFileSync('C:/Users/daoge/code/project/the-bot/src/core/database/migrations/builtin-apps/script-to-video.json', 'utf8'))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const r = await page.evaluate((graph) => window.electronAPI.workflow.validateGraph(graph), raw.graph)
  console.log(JSON.stringify(r, null, 2))
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })