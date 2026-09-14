// 排查：对 outlineReview 直调 reviewDecide(approve)，打印结果与状态
const { connect } = require('./_lib_cdp')
const fs = require('fs')
const RUN_ID = fs.readFileSync('progress/_v3_60s_invest_run_id.txt', 'utf-8').trim()
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function main() {
  const { browser, page } = await connect()
  const ev = (expr) => page.evaluate(expr)
  const d = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : null))`)
  const or = ((d && d.nodeRuns) || []).find(n => n.nodeId === 'outlineReview')
  console.log('run status:', d && d.run && d.run.status, '| outlineReview:', or && or.status)
  if (or && or.status === 'waiting_review') {
    const r = await ev(`window.electronAPI.workflow.reviewDecide(${JSON.stringify({ runId: RUN_ID, nodeId: 'outlineReview', decision: 'approve' })}).then(x => x)`)
    console.log('reviewDecide:', JSON.stringify(r))
  }
  await sleep(3000)
  const d2 = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : null))`)
  const or2 = ((d2 && d2.nodeRuns) || []).find(n => n.nodeId === 'outlineReview')
  console.log('after: run', d2 && d2.run && d2.run.status, '| outlineReview:', or2 && or2.status)
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
