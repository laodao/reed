// 检查 asset run 的 strategy 输出与 splitShots/boardReview 输入解析
const { chromium } = require('playwright-core')
const RUN_ID = process.argv[2]
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const d = await p.evaluate(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => x.data)`)
  const nr = (d && d.nodeRuns) || []
  const pick = (id) => nr.filter(n => n.nodeId === id).map(n => ({ status: n.status, error: n.error, input: n.input, output: n.output }))
  console.log('strategy:', JSON.stringify(pick('strategy')).slice(0, 900))
  const ss = pick('splitShots')
  console.log('splitShots:', JSON.stringify(ss).slice(0, 700))
  const br = pick('boardReview')
  console.log('boardReview payload keys:', br[0] && br[0].input && br[0].input.payload ? Object.keys(br[0].input.payload) : 'none', '| strategy key=', br[0] && br[0].input && br[0].input.payload && br[0].input.payload.visualStrategy)
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
