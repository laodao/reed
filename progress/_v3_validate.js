// 本地校验 v3 JSON 图结构（稳健探测版）
const { chromium } = require('playwright-core')
const fs = require('fs')
const P = 'C:/Users/daoge/code/project/the-bot/src/core/database/migrations/builtin-apps/script-to-video-v3.json'
async function main() {
  const doc = JSON.parse(fs.readFileSync(P, 'utf-8'))
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = b.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  await new Promise(r => setTimeout(r, 1200))
  const small = await page.evaluate('(g) => g.nodes.length', doc.graph).catch(e => 'smallThrew:' + String(e).slice(0, 120))
  console.log('small arg test:', small)
  const out = await page.evaluate(`(async (graph) => {
    const w = window.electronAPI && window.electronAPI.workflow
    if (!w || typeof w.validateGraph !== 'function') return { noApi: true, hasWf: !!w }
    try {
      const v = await w.validateGraph(graph)
      return { ok: v && v.success, err: v && v.error, data: (v && v.data) || null }
    } catch (e) { return { threw: e && e.message } }
  })`, doc.graph).catch(err => ({ evaluateThrew: String(err).slice(0, 300) }))
  console.log('validate (typeof ' + typeof out + '):', JSON.stringify(out).slice(0, 1800))
  const ids = new Set(doc.graph.nodes.map(n => n.id))
  const dangling = doc.graph.edges.filter(e => !ids.has(e.sourceNodeId) || !ids.has(e.targetNodeId))
  const start = doc.graph.nodes.find(n => n.type === 'start')
  const keys = (start.config.inputs || []).map(i => i.key)
  console.log('dangling edges:', dangling.length, '| nodes:', doc.graph.nodes.length, '| edges:', doc.graph.edges.length)
  console.log('start inputs:', keys.length, '| visualStrategy:', keys.includes('visualStrategy'))
  console.log('strategy ok:', doc.graph.nodes.some(n => n.id === 'strategy'))
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
