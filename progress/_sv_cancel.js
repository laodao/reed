// 取消运行 wfrun_1788692895820_6qliftu8w
const { chromium } = require('playwright-core')
const RUN_ID = 'wfrun_1788692895820_6qliftu8w'
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const r = await page.evaluate((rid) => window.electronAPI.workflow.cancelRun(rid).then(x => x), RUN_ID)
  console.log(JSON.stringify(r))
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
