// 同步 daily-news-brief / industry-weekly 的 publishedGraph 为新 JSON 图（与 draft 一致；直写绕过发布校验，
// 同 createBuiltinApps 对内置模板的落库语义。manual run 用 draftGraph，已在上一步生效；此处保证 cron/分享等 published 路径一致）
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
    const u = await page.evaluate(([id, g]) => window.electronAPI.workflow.updateDefinition(id, { publishedGraph: g }).then(x => x), [t.defId, raw.graph])
    console.log(t.defId, 'update publishedGraph:', u && u.success ? 'OK' : JSON.stringify(u && u.error))
  }
  // 复核
  for (const t of TARGETS) {
    const d = await page.evaluate(did => window.electronAPI.workflow.getDefinition(did).then(x => (x.success ? x.data : { error: x.error })), t.defId)
    const pub = d && d.publishedGraph
    const img = ((pub && pub.nodes) || []).filter(n => n.type === 'save-asset' && (n.config || {}).category === 'image')
    console.log(t.defId, 'published image-save:', img.map(n => n.id).join(', ') || 'NONE')
  }
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
