/* Atlas 最终验收：淡化/大纲树/空白取消 + 截图（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))

  // T5 金融合规 截图
  await page.evaluate('window.location.hash = "#/domain-learning/fincompliance/atlas"')
  await wait(4000)
  let buf = await page.screenshot({ path: 'progress/_atlas_t5.png' })
  console.log('T5_SHOT bytes=' + buf.length)

  // 点《反洗钱法》后淡化数量（选中邻居高亮，非邻居 opacity 低）
  const circle = await page.evaluate(`(() => {
    const n = Array.from(document.querySelectorAll('.graph-node')).find(x => x.textContent.includes('反洗钱法'))
    const c = n ? n.querySelector('circle') : null
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  await page.mouse.click(circle.x, circle.y)
  await wait(700)
  const styles = await page.evaluate(`(() => {
    const ns = Array.from(document.querySelectorAll('.graph-node'))
    const opacities = ns.map(n => ({ name: (n.textContent || '').slice(0, 12), op: getComputedStyle(n).opacity }))
    const low = opacities.filter(o => parseFloat(o.op) < 0.5)
    return JSON.stringify({ total: ns.length, dimLike: low.length, sample: opacities.slice(0, 4) })
  })()`)
  console.log('FOCUS_DIM=' + styles)
  buf = await page.screenshot({ path: 'progress/_atlas_t5_focus.png' })
  console.log('FOCUS_SHOT bytes=' + buf.length)

  // T7 大模型前沿 截图
  await page.evaluate('window.location.hash = "#/domain-learning/llmfrontier/atlas"')
  await wait(4000)
  buf = await page.screenshot({ path: 'progress/_atlas_t7.png' })
  console.log('T7_SHOT bytes=' + buf.length)

  // 大纲树点击定位（点树中"幻觉与可验证性"）
  await page.evaluate(`(() => {
    const tn = Array.from(document.querySelectorAll('.tree-node')).find(x => x.textContent.includes('幻觉与可验证性'))
    if (tn) tn.click()
  })()`)
  await wait(700)
  const treeSel = await page.evaluate(`(() => {
    const prof = document.querySelector('.profile-header')
    return prof ? prof.innerText : ''
  })()`)
  console.log('TREE_SELECT=' + treeSel)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
