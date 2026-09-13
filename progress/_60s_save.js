// 保存 60s 资产全文（textContent）到 progress/_60s_asset.md
const { chromium } = require('playwright-core')
const fs = require('fs')
const ASSET_ID = 'asset_1788523944352_tjb4e1jsi'
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const d = await p.evaluate(`window.electronAPI.assets.get('${ASSET_ID}').then(x => (x && x.success ? x.data : null))`)
  if (!d || !d.textContent) { console.log('EMPTY'); await b.close(); return }
  fs.writeFileSync('progress/_60s_asset.md', d.textContent, 'utf-8')
  console.log('saved len=', d.textContent.length)
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
