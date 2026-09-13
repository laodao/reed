// 打印 DB daily/industry 图中 extract1/start 等节点 config（对比 JSON），判断 DB 版与本地 JSON 差异
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const TARGETS = [
  { defId: 'builtin_def_daily-news-brief', file: 'daily-news-brief.json' },
  { defId: 'builtin_def_industry-weekly', file: 'industry-weekly.json' },
]

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  for (const t of TARGETS) {
    const exp = await page.evaluate(id => window.electronAPI.workflow.exportDefinition(id).then(r => r), t.defId)
    const db = JSON.parse(exp.data.content)
    const local = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src/core/database/migrations/builtin-apps', t.file), 'utf8'))
    const dbNodes = new Map(db.graph.nodes.map(n => [n.id, n]))
    console.log('====', t.defId, '====')
    for (const n of local.graph.nodes) {
      const dbn = dbNodes.get(n.id)
      if (!dbn) continue
      if (n.id === 'extract1') {
        console.log('extract1 DB config :', JSON.stringify(dbn.config))
        console.log('extract1 local config:', JSON.stringify(n.config))
      }
    }
  }
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
