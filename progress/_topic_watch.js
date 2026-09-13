const { chromium } = require('playwright-core')
const fs = require('fs')
const RUN_ID = fs.readFileSync('C:/Users/daoge/code/project/the-bot/progress/_topic_run_id.txt','utf-8').trim()
async function main(){
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const r = await p.evaluate(id => window.electronAPI.workflow.getRun(id).then(x=>x), RUN_ID)
  const d = r?.data
  console.log('run:', d?.run?.status, '| runId:', RUN_ID)
  const rows = (d?.nodeRuns ?? []).filter(n => ['r1','e1','pack1','round1'].includes(n.nodeId))
  console.log('循环体内节点执行行:')
  for (const n of rows.sort((a,c)=> a.nodeId.localeCompare(c.nodeId) || a.iterationIndex-c.iterationIndex)) {
    console.log(`  ${n.nodeId} [iter ${n.iterationIndex}] ${n.status}`)
  }
  const round = (d?.nodeRuns ?? []).find(n => n.nodeId==='round1')
  console.log('round1 输出:', round?.output ? `iterations=${round.output.iterations}` : '(循环未结束)')
  await b.close()
}
main().catch(e=>{console.error(e);process.exit(1)})
