// 校验三个报告工作流 JSON 图（通过运行中的应用 wf:validate-graph）
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const FILES = ['gossip-event-report.json', 'daily-news-brief.json', 'industry-weekly.json']

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  for (const file of FILES) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src/core/database/migrations/builtin-apps', file), 'utf8'))
    const r = await page.evaluate(g => window.electronAPI.workflow.validateGraph(g).then(x => x), raw.graph)
    console.log('====', file, '====')
    console.log('valid:', r && r.success, r && r.valid, '| errors:', JSON.stringify(r && (r.errors || r.error) || null).slice(0, 500))
    // 打印 report-image / saveImg 节点清单
    const rep = (raw.graph.nodes || []).filter(n => n.type === 'report-image' || (n.type === 'save-asset' && (n.config && n.config.category === 'image')))
    console.log('image nodes:', rep.map(n => `${n.id}(${n.type})`).join(', '))
  }
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
