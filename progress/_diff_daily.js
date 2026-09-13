// daily-news-brief：DB 图 vs 本地 JSON 的逐节点 diff
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const exp = await page.evaluate(id => window.electronAPI.workflow.exportDefinition(id).then(r => r), 'builtin_def_daily-news-brief')
  const db = JSON.parse(exp.data.content)
  const local = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src/core/database/migrations/builtin-apps', 'daily-news-brief.json'), 'utf8'))

  const dbNodes = new Map(db.graph.nodes.map(n => [n.id, n]))
  const localNodes = new Map(local.graph.nodes.map(n => [n.id, n]))
  console.log('node diff (config):')
  for (const id of dbNodes.keys()) {
    const a = dbNodes.get(id); const b = localNodes.get(id)
    if (!b) { console.log('  only DB:', id); continue }
    const ja = JSON.stringify(a.config ?? {}); const jb = JSON.stringify(b.config ?? {})
    if (ja !== jb) {
      console.log('  [' + id + '] type=' + a.type)
      console.log('    DB   :', ja.slice(0, 400))
      console.log('    local:', jb.slice(0, 400))
    }
  }
  for (const id of localNodes.keys()) if (!dbNodes.has(id)) console.log('  only local:', id)

  const edb = new Set(JSON.stringify(db.graph.edges))
  const el = new Set(JSON.stringify(local.graph.edges))
  console.log('edges equal stringify:', JSON.stringify(db.graph.edges) === JSON.stringify(local.graph.edges))
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
