// 检查运行状态 + 尝试对挂起 review1 approve 并打印结果
const { chromium } = require('playwright-core')
const fs = require('fs')
const RUN_ID = 'wfrun_1788691576563_nobamuqv9'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const ev = (expr) => page.evaluate(expr)

  const r = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : { error: x.error }))`)
  console.log('STATUS:', r && r.status)
  const nr = (r && r.nodeRuns) || []
  for (const n of nr) {
    if (['review1', 'vid1', 'img1', 'parse1', 'loopShot', 'htmlPre'].includes(n.nodeId) && n.status === 'waiting_review') {
      console.log('WAITING NODE:', JSON.stringify({ nodeId: n.nodeId, iter: n.iterationIndex, status: n.status, input: n.input }, null, 2))
      const dec = await ev(`window.electronAPI.workflow.reviewDecide(${JSON.stringify({ runId: RUN_ID, nodeId: n.nodeId, decision: 'approve', comment: '用户授权：ComfyUI 免费，审核环节由 Agent 代为批准' })}).then(x => x)`)
      console.log('DECIDE RESULT:', JSON.stringify(dec))
    }
  }
  console.log('nodeRuns tail:', nr.slice(-6).map(n => `${n.nodeId}#${n.iterationIndex ?? 0}:${n.status}`).join(' | '))
  fs.writeFileSync('C:/Users/daoge/code/project/the-bot/progress/_sv_manual_state.json', JSON.stringify(r, null, 2), 'utf-8')
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
