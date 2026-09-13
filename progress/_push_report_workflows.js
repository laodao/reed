// 推 daily-news-brief / industry-weekly 新图到 DB draftGraph（manual run 使用 draftGraph；不触发发布校验）
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
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src/core/database/migrations/builtin-apps', t.file), 'utf8'))
    const v = await page.evaluate(g => window.electronAPI.workflow.validateGraph(g).then(x => x), raw.graph)
    if (!v || !v.success || v.valid === false) { console.log(t.defId, 'validate FAIL', JSON.stringify(v)); continue }
    const sd = await page.evaluate(([id, g]) => window.electronAPI.workflow.saveDraft(id, g).then(x => x), [t.defId, raw.graph])
    console.log(t.defId, 'saveDraft:', sd && sd.success ? 'OK' : JSON.stringify(sd && sd.error))
  }
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
