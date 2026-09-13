// 探测 electronAPI 表面：顶层键 + assets 键 + workflow 键（字符串表达式）
const { connect } = require('./_lib_cdp')
async function main() {
  const { browser, page } = await connect()
  const r = await page.evaluate(`(() => {
    const api = window.electronAPI || {}
    const top = Object.keys(api)
    const assets = api.assets ? Object.keys(api.assets) : []
    const workflow = api.workflow ? Object.keys(api.workflow) : []
    return { top, assets, workflow }
  })()`)
  console.log('TOP:', r.top.join(', '))
  console.log('ASSETS:', r.assets.join(', '))
  console.log('WORKFLOW:', r.workflow.join(', '))
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
