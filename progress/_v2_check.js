// 验证 V2 定义入库 + validateGraph
const { chromium } = require('playwright-core')
const fs = require('fs')
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const ev = (expr) => page.evaluate(expr)

  const def = await ev(`window.electronAPI.workflow.getDefinition('builtin_def_script-to-video-v2').then(x => (x.success ? x.data : { error: x.error }))`)
  const graph = def && (def.publishedGraph || def.graph)
  console.log('DEF:', JSON.stringify({ id: def && def.id, name: def && def.name, templateVersion: def && def.templateVersion, nodes: graph && graph.nodes.length, edges: graph && graph.edges.length, settings: def && def.settings }))

  const apps = await ev(`window.electronAPI.app.list(${JSON.stringify({ page: 1, pageSize: 40 })}).then(x => (x.success ? x.data : { error: x.error }))`)
  const hit = (apps && apps.items || []).find(a => String(a.name || '').includes('V2'))
  console.log('APP V2:', JSON.stringify(hit && { id: hit.id, name: hit.name, defId: hit.definitionId }))

  const raw = JSON.parse(fs.readFileSync('C:/Users/daoge/code/project/the-bot/src/core/database/migrations/builtin-apps/script-to-video-v2.json', 'utf-8'))
  const v = await ev(`window.electronAPI.workflow.validateGraph(${JSON.stringify(raw.graph)}).then(x => (x.success ? { ok: true, data: x.data } : { ok: false, error: x.error }))`)
  console.log('VALIDATE:', JSON.stringify(v))
  fs.writeFileSync('C:/Users/daoge/code/project/the-bot/progress/_v2_validate.json', JSON.stringify({ def, validate: v }, null, 2), 'utf-8')
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
