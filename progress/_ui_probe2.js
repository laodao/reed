// 探测 listRuns 参数与 definitionId 过滤
const { chromium } = require('playwright-core')
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const out = await p.evaluate(`(async () => {
    const w = window.electronAPI.workflow
    const r = {}
    try {
      const a = await w.listRuns({ page: 1, pageSize: 2 })
      r.all = { s: !!a.success, e: a.error, d: JSON.stringify(a.data).slice(0, 600) }
    } catch (e) { r.all = 'threw ' + e.message }
    try {
      const b2 = await w.listRuns({ page: 1, pageSize: 2, definitionId: 'builtin_def_script-to-video-v2' })
      r.byDef = { s: !!b2.success, e: b2.error, d: JSON.stringify(b2.data).slice(0, 600) }
    } catch (e2) { r.byDef = 'threw ' + e2.message }
    return r
  })()`)
  console.log(JSON.stringify(out, null, 1).slice(0, 2600))
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
