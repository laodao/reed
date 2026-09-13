/* Atlas 档案交互验收 v4：用 g 的渲染 rect 点击（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))

  await page.evaluate('window.location.hash = "#/domain-learning/fincompliance/atlas"')
  await wait(4000)

  // 取《反洗钱法》g 的实际渲染矩形中心
  const center = await page.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('.graph-node'))
    const n = nodes.find(x => x.textContent.includes('反洗钱法'))
    if (!n) return null
    const r = n.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: n.textContent }
  })()`)
  console.log('CENTER=' + JSON.stringify(center))
  await page.mouse.click(center.x, center.y)
  await wait(1000)
  const body = await page.evaluate(`(() => {
    const prof = document.querySelector('.profile-body')
    const sel = document.querySelector('.profile-header')
    return JSON.stringify({
      header: sel ? sel.innerText : '',
      body: prof ? prof.innerText.slice(0, 400) : '',
      dimCount: document.querySelectorAll('.graph-node.dim').length,
      selCount: document.querySelectorAll('.graph-node.selected').length
    })
  })()`)
  console.log('STATE=' + body)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
