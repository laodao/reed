// 备份 def DB 快照（getDefinition 全文）
const { connect } = require('./_lib_cdp')
const fs = require('fs')
async function main() {
  const { browser, page } = await connect()
  const d = await page.evaluate(`window.electronAPI.workflow.getDefinition('builtin_def_script-to-video-v3').then(x => (x.success ? x.data : null))`)
  console.log('def keys:', d ? Object.keys(d).join(',') : 'null')
  if (!d) throw new Error('no def')
  fs.writeFileSync('scripts/backup-writerlayer-20260907/def-get-v3.json', JSON.stringify(d, null, 2), 'utf-8')
  console.log('def DB snapshot saved')
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
