// 盘点：早报/行业周报/吃瓜报告文本资产（含 sourceRef）→ workflow-reports 现成 PNG → 已存在配套长图 asset
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const DATA_ROOT = 'C:/Users/daoge/the-bot'
const WR = path.join(DATA_ROOT, 'workflow-reports')
const pngs = fs.existsSync(WR)
  ? fs.readdirSync(WR).filter(f => f.endsWith('.png')).map(f => f.replace(/\.png$/, ''))
  : []
console.log('workflow-reports PNG count:', pngs.length)

// runId -> 可能渲染节点名（已知 report 节点 id）
function pngForRun(runId) {
  const prefix = `${runId}_`
  const hits = pngs.filter(p => p.startsWith(prefix))
  return hits
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')

  const results = []
  for (const sub of ['早报', '行业周报', '吃瓜报告']) {
    const r = await page.evaluate(q => window.electronAPI.assets.list({ category: 'text', subCategory: q, page: 1, pageSize: 200 }).then(x => (x.success ? x.data : { error: x.error })), sub)
    const items = (r && r.items) || []
    console.log(`\n==== text/${sub} total=${r && r.total} fetched=${items.length} ====`)
    // 全量 image 资产（用于判断同 run 是否已有长图）
    const imgR = await page.evaluate(() => window.electronAPI.assets.list({ category: 'image', page: 1, pageSize: 300 }).then(x => (x.success ? x.data : { error: x.error })))
    const imgItems = (imgR && imgR.items) || []
    const imgByRun = new Map()
    for (const a of imgItems) {
      if (a.sourceRef) {
        const arr = imgByRun.get(a.sourceRef) || []
        arr.push(a)
        imgByRun.set(a.sourceRef, arr)
      }
    }
    for (const a of items) {
      const rid = a.sourceRef || ''
      const pngHits = rid ? pngForRun(rid) : []
      const hasImg = rid ? (imgByRun.get(rid) || []).length > 0 : false
      results.push({ sub, id: a.id, name: a.name, runId: rid, hasImgAsset: hasImg, pngHits })
      console.log(JSON.stringify({ id: a.id, name: a.name, runId: rid, hasImgAsset: hasImg, pngHits: pngHits.slice(0, 3) }))
    }
  }
  const missingPng = results.filter(x => !x.hasImgAsset && x.pngHits.length === 0)
  const hasPngOnly = results.filter(x => !x.hasImgAsset && x.pngHits.length > 0)
  const already = results.filter(x => x.hasImgAsset)
  console.log('\n=== 汇总 ===')
  console.log('已有配套图:', already.length)
  console.log('缺图但有现成 PNG 可复用:', hasPngOnly.length)
  console.log('缺图且无现成 PNG（需重新渲染）:', missingPng.length)
  for (const x of missingPng) console.log('  需渲染:', JSON.stringify(x))
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
