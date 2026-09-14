/* Atlas 档案交互验收 v2（临时脚本不入库） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))

  // T5：点击《反洗钱法》(法规节点)
  await page.evaluate('window.location.hash = "#/domain-learning/fincompliance/atlas"')
  await wait(4000)
  const lawNode = page.locator('.graph-node', { hasText: '反洗钱法' }).first()
  await lawNode.scrollIntoViewIfNeeded().catch(() => {})
  await lawNode.click({ position: { x: 8, y: 8 } }).catch(e => console.log('CLICK_ERR ' + e.message))
  await wait(900)
  const prof = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    return JSON.stringify({
      profileName: has('定义 / 要点'),
      lawName: has('《反洗钱法》(2025 修订)'),
      attrs: has('效力') && has('法律') && has('施行'),
      related: has('关联内容'),
      relCount: (document.body.innerText.match(/直接关系/g) || []).length
    })
  })()`)
  console.log('T5_PROFILE=' + prof)

  // 打开子图谱（档案按钮）
  const drillBtn = page.locator('.p-actions button', { hasText: '打开子图谱' }).first()
  await drillBtn.click().catch(e => console.log('DRILL_ERR ' + e.message))
  await wait(900)
  const drilled = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    return JSON.stringify({
      crumb: has('子图谱'),
      now: has('《反洗钱法》') || has('反洗钱法'),
      nodesLeft: document.querySelectorAll('.graph-node').length
    })
  })()`)
  console.log('T5_DRILL=' + drilled)

  // 回全图
  await page.evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll('.atlas-actions button'))
    const b = btns.find(x => x.textContent.includes('全图'))
    if (b) b.click()
  })()`)
  await wait(600)

  // 返回学习空间按钮在顶栏第一个（返回学习空间）——验证能回
  const backBtn = page.locator('.atlas-header button', { hasText: '返回学习空间' }).first()
  await backBtn.click().catch(e => console.log('BACK_ERR ' + e.message))
  await wait(1200)
  const backHash = await page.evaluate('location.hash')
  console.log('BACK_HASH=' + backHash)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
