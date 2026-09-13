// 取消卡死运行
const { chromium } = require('playwright-core')
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  for (const rid of ['wfrun_1788698719420_grxbvr4ym']) {
    const r = await page.evaluate((x) => window.electronAPI.workflow.cancelRun(x).then(z => z), rid)
    console.log(rid, JSON.stringify(r))
  }
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
