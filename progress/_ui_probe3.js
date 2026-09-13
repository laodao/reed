// 枚举页面并探测 electronAPI 可用性
const { chromium } = require('playwright-core')
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = b.contexts()[0]
  const pages = ctx.pages()
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i]
    let info = {}
    try {
      info = await pg.evaluate(`({ url: location.href, title: document.title, hasElectron: !!(window.electronAPI), hasWf: !!(window.electronAPI && window.electronAPI.workflow) })`)
    } catch (e) { info = { evalErr: String(e).slice(0, 120) } }
    console.log(i, JSON.stringify(info))
  }
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
