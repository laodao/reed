// 精确拉取 5 份同名脚本资产全文 → 独立文件 + 索引
const { chromium } = require('playwright-core')
const fs = require('fs')
const IDS = [
  'asset_1788530561207_1cacdwcwa',
  'asset_1788527560685_dk2s5x7fe',
  'asset_1788527372697_rewivi5ch',
  'asset_1788527152104_wawxcoiaa',
  'asset_1788523944352_tjb4e1jsi',
]
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const ev = (expr) => page.evaluate(expr)
  const idx = []
  for (let i = 0; i < IDS.length; i++) {
    const id = IDS[i]
    const d = await ev(`window.electronAPI.assets.get(${JSON.stringify(id)}).then(x => (x.success ? x.data : null))`)
    const txt = (d && d.textContent) || ''
    const file = `C:/Users/daoge/code/project/the-bot/progress/_sv_asset_${i}.md`
    fs.writeFileSync(file, txt, 'utf-8')
    idx.push({ i, id, len: txt.length, file })
  }
  fs.writeFileSync('C:/Users/daoge/code/project/the-bot/progress/_sv_asset_index.json', JSON.stringify(idx, null, 2), 'utf-8')
  console.log(JSON.stringify(idx))
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
