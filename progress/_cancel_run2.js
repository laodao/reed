// 通用：取消运行（runId 参数或读 _v3_60s_run_id.txt）
const { connect } = require('./_lib_cdp')
const fs = require('fs')
const RUN_ID = process.argv[2] || fs.readFileSync('progress/_v3_60s_run_id.txt', 'utf-8').trim()
async function main() {
  const { browser, page } = await connect()
  const r = await page.evaluate(`window.electronAPI.workflow.cancelRun(${JSON.stringify(RUN_ID)}).then(x => x)`)
  console.log('CANCEL', RUN_ID, '→', JSON.stringify(r))
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
