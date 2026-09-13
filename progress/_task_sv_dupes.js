// 列出同名脚本资产各自的创建时间/长度/内容头，帮助确定目标
const { chromium } = require('playwright-core')
const fs = require('fs')
const OUT = 'C:/Users/daoge/code/project/the-bot/progress/_task_sv_dupes.json'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const ev = (expr) => page.evaluate(expr)

  const r = await ev(`window.electronAPI.assets.list(${JSON.stringify({ keyword: '星宇股份短视频脚本', page: 1, pageSize: 50 })}).then(x => (x.success ? x.data : { error: x.error }))`)
  const items = []
  for (const a of (r?.items || [])) {
    const d = await ev(`window.electronAPI.assets.get(${JSON.stringify(a.id)}).then(x => (x.success ? x.data : null))`)
    items.push({
      id: a.id, name: a.name, createdAt: d && d.createdAt, updatedAt: d && d.updatedAt,
      textLen: d ? (d.textContent || '').length : -1,
      description: d && d.description,
      tags: d && d.tags,
      head: d ? (d.textContent || '').slice(0, 220).replace(/\n/g, '⏎') : '',
    })
  }
  fs.writeFileSync(OUT, JSON.stringify(items, null, 2), 'utf-8')
  console.log('WROTE', OUT, 'count=' + items.length)
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
