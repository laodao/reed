/* Atlas 档案交互验收 v3：真实鼠标点击（临时脚本不入库） */
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

  // 换算：取目标 g 的 transform 图坐标 + svg 几何 → 屏幕坐标
  const target = await page.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('.graph-node'))
    const n = nodes.find(x => x.textContent.includes('反洗钱法'))
    if (!n) return null
    const m = (n.getAttribute('transform') || '').match(/translate\\(([0-9.]+),\\s*([0-9.]+)\\)/)
    if (!m) return null
    const svg = document.querySelector('.graph-svg')
    const vb = svg.getAttribute('viewBox').split(/[ ,]+/).map(Number) // x y w h
    const r = svg.getBoundingClientRect()
    // 图坐标 → 屏幕坐标（viewBox 线性映射；无 preserveAspectRatio 默认可能等比，取宽比）
    const sx = r.left + ((parseFloat(m[1]) - vb[0]) / vb[2]) * r.width
    const sy = r.top + ((parseFloat(m[2]) - vb[1]) / vb[3]) * r.height
    return { sx, sy }
  })()`)
  if (!target) { console.log('NODE_NOT_FOUND'); return }
  console.log('TARGET=' + JSON.stringify(target))

  await page.mouse.click(target.sx, target.sy)
  await wait(900)
  const prof = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    return JSON.stringify({
      lawName: has('《反洗钱法》(2025 修订)'),
      defBlock: has('定义 / 要点'),
      attrs: has('效力') && has('法律'),
      related: has('关联内容'),
      relHeading: has('直接关系')
    })
  })()`)
  console.log('PROFILE=' + prof)

  // 选中后高亮/淡化应生效（非邻居淡化数量 > 0）
  const dim = await page.evaluate('document.querySelectorAll(".graph-node.dim").length')
  console.log('DIM_NODES=' + dim)

  // 打开子图谱按钮
  const drill = await page.evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll('.p-actions button'))
    const b = btns.find(x => x.textContent.includes('打开子图谱'))
    if (b) { b.click(); return 'CLICKED' }
    return 'NOT_FOUND'
  })()`)
  console.log('DRILL=' + drill)
  await wait(900)
  const drilled = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    return JSON.stringify({
      crumb: has('子图谱'),
      nodes: document.querySelectorAll('.graph-node').length
    })
  })()`)
  console.log('DRILLED=' + drilled)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
