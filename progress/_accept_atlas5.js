/* Atlas 档案交互验收 v5：点击 circle 本体（临时脚本） */
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

  const circle = await page.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('.graph-node'))
    const n = nodes.find(x => x.textContent.includes('反洗钱法'))
    if (!n) return null
    const c = n.querySelector('circle')
    const r = c.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  console.log('CIRCLE=' + JSON.stringify(circle))
  await page.mouse.click(circle.x, circle.y)
  await wait(1000)
  const state = await page.evaluate(`(() => {
    const sel = document.querySelector('.profile-header')
    const body = document.querySelector('.profile-body')
    return JSON.stringify({
      header: sel ? sel.innerText.replace(/\\n/g,' | ') : '',
      bodyHead: body ? body.innerText.slice(0, 260).replace(/\\n/g,' | ') : '',
      dimCount: document.querySelectorAll('.graph-node.dim').length,
      selCount: document.querySelectorAll('.graph-node.selected').length
    })
  })()`)
  console.log('STATE=' + state)
  // 双击下钻：再 click 一次同一位置（真实 dblclick 由两次 click 组成）
  await page.mouse.dblclick(circle.x, circle.y)
  await wait(900)
  const drilled = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    return JSON.stringify({
      crumb: has('子图谱'),
      nodeCount: document.querySelectorAll('.graph-node').length
    })
  })()`)
  console.log('DBL_DRILL=' + drilled)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
