// 探测运行详情/历史相关 API 与数据结构（UI 改造用）
const { chromium } = require('playwright-core')
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const ev = (e) => p.evaluate(e)
  const api = await ev(`Object.keys(window.electronAPI.workflow || {})`)
  console.log('workflow api keys:', JSON.stringify(api))

  const run = await ev(`window.electronAPI.workflow.getRun('wfrun_1788708132226_3r7rt9zxu').then(x => (x && x.success ? x.data : null))`)
  if (!run) { console.log('NO RUN'); await b.close(); return }
  console.log('getRun top keys:', JSON.stringify(Object.keys(run)))
  console.log('run.run keys:', JSON.stringify(Object.keys(run.run || {})))
  const rr = run.run || {}
  console.log('has definitionId:', rr.definitionId, '| graphSnapshot?', !!(rr.graphSnapshot), '| templateVersion:', rr.templateVersion)
  console.log('has nodeRuns array:', Array.isArray(run.nodeRuns), 'count:', (run.nodeRuns || []).length)
  const nr = (run.nodeRuns || [])[0]
  console.log('nodeRun keys:', JSON.stringify(nr ? Object.keys(nr) : []))
  console.log('nodeRun sample:', JSON.stringify(nr && { nodeId: nr.nodeId, status: nr.status, iterationIndex: nr.iterationIndex, startedAt: nr.startedAt, finishedAt: nr.finishedAt }).slice(0, 300))
  const def = await ev(`window.electronAPI.workflow.getDefinition('${rr.definitionId}').then(x => (x && x.success ? x.data : null)).catch(() => null)`)
  console.log('def found:', !!def, '| def keys:', def ? JSON.stringify(Object.keys(def)) : '')
  const g = def && (def.publishedGraph || (def.graph && def.graph.graph))
  console.log('graph nodes:', g ? g.nodes.length : 'n/a', 'edges:', g ? g.edges.length : 'n/a')
  // 历史运行列表（该定义）
  const hist = await ev(`(() => { const w = window.electronAPI.workflow; const names = Object.keys(w); const cands = ['listRuns','getRuns','queryRuns','runList','getRunList','listRunHistory']; const out = {}; for (const c of cands) { if (typeof w[c] === 'function') { try { out[c + '_keys'] = Object.keys(w[c].length ? w[c].length : 0); const r = await w[c]({ definitionId: '${rr.definitionId}', page: 1, pageSize: 3 }); out[c] = { success: r && r.success, err: r && r.error, sample: JSON.stringify(r && r.data).slice(0, 400) }; } catch (e2) { out[c] = 'threw ' + e2.message } } } return out })()`)
  console.log('hist probe:', JSON.stringify(hist).slice(0, 2000))
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
