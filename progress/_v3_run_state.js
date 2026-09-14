// 查看 v3 run 终态/失败细节
const { chromium } = require('playwright-core')
const RUN_ID = process.argv[2]
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const expr = `window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => x.data)`
  const d = await p.evaluate(expr)
  const run = (d && d.run) || {}
  const nr = (d && Array.isArray(d.nodeRuns)) ? d.nodeRuns : []
  const fn = nr.find(n => n.status === 'failed')
  console.log('status:', run.status, '| error:', run.error ? String(run.error).slice(0, 300) : 'none')
  if (fn) console.log('failedNode:', fn.nodeId, '|', String(fn.error || '').slice(0, 500))
  console.log('runs:', nr.length, nr.map(n => n.nodeId + (n.iterationIndex ? '#' + n.iterationIndex : '') + ':' + n.status).join(' '))
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
