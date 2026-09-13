// 全量复核：每条文本报告（早报/行业周报/吃瓜报告）是否都有配套长图图片资产（按 sourceRef=runId 配对）
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')

  // image 资产 → runId 集合（sourceRef）
  const imgRun = new Set()
  for (let p = 1; ; p++) {
    const r = await page.evaluate(pp => window.electronAPI.assets.list({ category: 'image', page: pp, pageSize: 200 }).then(x => (x.success ? x.data : { error: x.error })), p)
    const items = (r && r.items) || []
    for (const a of items) if (a.sourceRef) imgRun.add(a.sourceRef)
    if (!r || !r.items || p * 200 >= (r.total || 0) || items.length === 0) break
  }
  console.log('图片资产对应 run 数:', imgRun.size)

  let total = 0, covered = 0
  for (const [cat, sub] of [['text', '早报'], ['text', '行业周报'], ['text', '吃瓜报告']]) {
    let itemsAll = []
    for (let p = 1; ; p++) {
      const r = await page.evaluate(([c, s, pp]) => window.electronAPI.assets.list({ category: c, subCategory: s, page: pp, pageSize: 200 }).then(x => (x.success ? x.data : { error: x.error })), [cat, sub, p])
      const items = (r && r.items) || []
      itemsAll = itemsAll.concat(items)
      if (!r || !r.items || p * 200 >= (r.total || 0) || items.length === 0) break
    }
    let ok = 0
    for (const a of itemsAll) {
      total++
      if (a.sourceRef && imgRun.has(a.sourceRef)) { ok++; continue }
      // 补录图 sourceRef 与原文本一致 → 已覆盖
      console.log('  缺图:', sub, a.name, '| run', a.sourceRef)
    }
    covered += ok
    console.log(`[${sub}] 文本 ${itemsAll.length} 条，runId 有图 ${ok}`)
  }
  console.log(`\n合计文本 ${total}，全部按 runId 配到图: ${covered === total ? '是' : `否(${covered}/${total})`}`)

  // 复核资产中心打开零渲染
  await page.evaluate(() => {
    window.__probe2 = { calls: 0 }
    const orig = window.electronAPI.assets.previewRender.bind(window.electronAPI.assets)
    window.electronAPI.assets.previewRender = async (id) => { window.__probe2.calls++; return orig(id) }
  })
  await page.evaluate(() => { window.location.hash = '#/assets' })
  await page.waitForTimeout(2000)
  const probe = await page.evaluate(() => window.__probe2)
  console.log('打开资产中心 previewRender 调用:', probe.calls)
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
