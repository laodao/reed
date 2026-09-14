// 检查 asset run 的 bases 解析字段与分流输出
const { chromium } = require('playwright-core')
const RUN_ID = process.argv[2]
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const d = await p.evaluate(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => x.data)`)
  const nr = (d && d.nodeRuns) || []
  const ss = nr.find(n => n.nodeId === 'splitShots' && n.status === 'succeeded')
  const ins = (ss && ss.input && ss.input.inputs) || []
  const bases = ins.find(i => i.key === 'bases')
  const arr = (bases && bases.value) || []
  console.log('bases count:', arr.length)
  if (arr[0]) console.log('base[0] keys:', Object.keys(arr[0]).join(','))
  const modeIn = ins.find(i => i.key === 'mode')
  console.log('mode input resolved:', JSON.stringify(modeIn && modeIn.value))
  const out = (ss && ss.output && (ss.output.result || ss.output)) || {}
  console.log('split output: gen=' + (out.gen || []).length + ' base=' + (out.base || []).length)
  if ((out.base || [])[0]) console.log('base[0] fields:', JSON.stringify({ assetIdx: out.base[0].assetIdx, id: out.base[0].baseAssetId, name: out.base[0].baseImageName, path: out.base[0].baseImagePath }))
  const bm = nr.find(n => n.nodeId === 'boardMerge' && n.status === 'succeeded')
  const bmo = bm && bm.output && (bm.output.result || bm.output)
  console.log('boardMerge cards:', JSON.stringify((bmo && bmo.cards || []).map(c => ({ source: c.source, assetId: c.imageAssetId, name: c.imageAssetName, cap: String(c.caption).slice(0, 18) }))))
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
