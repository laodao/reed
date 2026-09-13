// 查看 assets.get 返回结构，定位全文存放字段
const { chromium } = require('playwright-core')
const ASSET_ID = 'asset_1788523944352_tjb4e1jsi'
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const ev = (e) => p.evaluate(e)
  const r = await ev(`window.electronAPI.assets.get('${ASSET_ID}').then(x => x)`)
  const d = r && r.success ? r.data : (r && r.data ? r.data : r)
  console.log('success:', r && r.success)
  console.log('TOP KEYS:', d ? Object.keys(d).join(',') : 'null')
  console.log('JSON(trunc):', JSON.stringify(d).slice(0, 1500))
  // list 查一下文本类资产条目字段
  const l = await ev(`window.electronAPI.assets.list({ page: 1, pageSize: 5 }).then(x => (x && x.success ? x.data : null))`)
  console.log('LIST item keys:', l && l.items && l.items[0] ? Object.keys(l.items[0]).join(',') : JSON.stringify(l).slice(0, 300))
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
