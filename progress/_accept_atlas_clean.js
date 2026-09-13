/* Atlas 首屏/聚焦验证（干净态）（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))

  // 先离开再进入，保证全新组件
  await page.evaluate('window.location.hash = "#/domain-learning"')
  await wait(1500)
  await page.evaluate('window.location.hash = "#/domain-learning/fincompliance/atlas"')
  await wait(4500)

  // 首屏全图节点数
  let n0 = await page.evaluate('document.querySelectorAll(".graph-node").length')
  console.log('INITIAL_NODES=' + n0)
  let buf = await page.screenshot({ path: 'progress/_atlas_t5_full.png' })
  console.log('FULL_SHOT=' + buf.length)

  // 点《反洗钱法》→ 淡化数量
  const circle = await page.evaluate(`(() => {
    const n = Array.from(document.querySelectorAll('.graph-node')).find(x => x.textContent.includes('反洗钱法'))
    const c = n ? n.querySelector('circle') : null
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  await page.mouse.click(circle.x, circle.y)
  await wait(800)
  const focusInfo = await page.evaluate(`(() => {
    const ns = Array.from(document.querySelectorAll('.graph-node'))
    const dim = ns.filter(n => parseFloat(getComputedStyle(n).opacity) < 0.5).length
    const selected = ns.filter(n => getComputedStyle(n).opacity === '1').length
    const prof = document.querySelector('.profile-header')
    return JSON.stringify({ dim, bright: selected, header: prof ? prof.innerText.slice(0, 30) : '' })
  })()`)
  console.log('FOCUS=' + focusInfo)
  buf = await page.screenshot({ path: 'progress/_atlas_t5_focus.png' })
  console.log('FOCUS_SHOT=' + buf.length)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
