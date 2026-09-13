// 取 vid1#0 的 taskId 与当前 run 状态
const { chromium } = require('playwright-core')
const fs = require('fs')
const RUN_ID = 'wfrun_1788692895820_6qliftu8w'
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const r = await page.evaluate((rid) => window.electronAPI.workflow.getRun(rid).then(x => (x.success ? x.data : { error: x.error })), RUN_ID)
  const run = r && r.run
  const nr = (r && r.nodeRuns) || []
  const vid = nr.find(n => n.nodeId === 'vid1' && n.iterationIndex === 0)
  const img = nr.find(n => n.nodeId === 'img1' && n.iterationIndex === 0)
  console.log('RUN:', run && run.status, '| error:', run && run.error)
  console.log('VID1#0:', JSON.stringify({ status: vid && vid.status, input: vid && vid.input, output: vid && vid.output, error: vid && vid.error }, null, 2))
  console.log('IMG1#0:', JSON.stringify({ status: img && img.status, output: img && img.output }, null, 2))
  fs.writeFileSync('C:/Users/daoge/code/project/the-bot/progress/_sv_run3_state.json', JSON.stringify({ run, nodeRuns: nr }, null, 2), 'utf-8')
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
