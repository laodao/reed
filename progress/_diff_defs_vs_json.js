// 对比 DB 内置定义导出 vs 仓库 builtin JSON（三个报告工作流）
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const FILES = {
  'builtin_def_gossip-event-report': 'gossip-event-report.json',
  'builtin_def_daily-news-brief': 'daily-news-brief.json',
  'builtin_def_industry-weekly': 'industry-weekly.json',
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  for (const [defId, file] of Object.entries(FILES)) {
    const exp = await page.evaluate(id => window.electronAPI.workflow.exportDefinition(id).then(r => r), defId)
    let db = null
    if (exp && exp.success && exp.data && exp.data.content) {
      try { db = JSON.parse(exp.data.content) } catch { db = exp.data.content }
    }
    const local = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src/core/database/migrations/builtin-apps', file), 'utf8'))
    console.log('====', defId, 'exportSuccess=', !!(exp && exp.success), '====')
    if (!db) { console.log(' DB export failed:', JSON.stringify(exp && exp.error)); continue }
    const dbGraph = JSON.stringify(db.graph || (db.definition && db.definition.graph))
    const localGraph = JSON.stringify(local.graph)
    console.log(' DB graph equals local JSON graph:', dbGraph === localGraph)
    if (dbGraph !== localGraph) {
      console.log(' DB name:', db.name, '| local name:', local.name)
      // 简要 diff：列出 db 独有/缺失节点 id
      const dbNodes = new Set((db.graph?.nodes || []).map(n => n.id))
      const localNodes = new Set((local.graph?.nodes || []).map(n => n.id))
      const onlyDb = [...dbNodes].filter(x => !localNodes.has(x))
      const onlyLocal = [...localNodes].filter(x => !dbNodes.has(x))
      console.log(' only in DB:', JSON.stringify(onlyDb), '| only in local JSON:', JSON.stringify(onlyLocal))
    }
  }
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
