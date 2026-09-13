// 打印运行当前状态与指定节点输出摘要
const { connect } = require('./_lib_cdp')
const fs = require('fs')
const RUN_ID = fs.readFileSync('progress/_v3_60s_run_id.txt', 'utf-8').trim()
async function main() {
  const { browser, page } = await connect()
  const d = await page.evaluate(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : { error: x.error }))`)
  const run = (d && d.run) || {}
  console.log('STATUS:', run.status)
  for (const n of (d && d.nodeRuns) || []) {
    const out = n.output || {}
    const okeys = Object.keys(out)
    let brief = ''
    if (n.nodeId === 'outlineReview') {
      const md = String(out.md || '').slice(0, 200)
      brief = 'mdHead=' + md.replace(/\n/g, '⏎')
    } else if (n.nodeId === 'strategy') {
      brief = JSON.stringify(out).slice(0, 160)
    } else {
      brief = 'keys=' + okeys.join(',') + (n.error ? ' ERR=' + String(n.error).slice(0, 160) : '')
    }
    console.log(`- ${n.nodeId} [${n.nodeType}] ${n.status} ${brief}`)
  }
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
