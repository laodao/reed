/* 验证标题栏右侧 icon 按钮 + tooltip（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  await page.reload({ waitUntil: 'load' })
  await wait(4000)
  await page.evaluate('window.location.hash = "#/domain-learning/llmfrontier"')
  await wait(3500)
  await page.evaluate(`(() => { const l=[...document.querySelectorAll('.tree-leaf')].find(x=>x.textContent.includes('混合专家')); if(l)l.click() })()`)
  await wait(1300)

  const info = await page.evaluate(`(() => {
    const actions = document.querySelector('.lesson-actions')
    const btns = actions ? actions.querySelectorAll('.el-button') : []
    const noBottomFeedback = !document.querySelector('.lesson-feedback')
    return JSON.stringify({
      inHeader: !!actions,
      btnCount: btns.length,
      icons: Array.from(btns).map(b => (b.querySelector('.el-icon') ? 'has-icon' : 'no-icon')),
      noBottomFeedback
    })
  })()`)
  console.log('BTNS=' + info)

  // 悬停第一个按钮（懂了）看 tooltip
  const btns = page.locator('.lesson-actions .el-button')
  await btns.first().hover()
  await wait(800)
  const tip = await page.evaluate(`(() => {
    const tips = Array.from(document.querySelectorAll('.el-popper:not([style*="display: none"])'))
    const visible = tips.filter(t => t.offsetParent !== null)
    return JSON.stringify(visible.map(t => t.textContent.trim()).filter(Boolean).slice(0, 3))
  })()`)
  console.log('TOOLTIP=' + tip)

  // 点"懂了"icon 验证反馈
  await btns.first().click()
  await wait(500)
  const after = await page.evaluate(`(() => {
    const toast = document.querySelector('.feedback-toast')
    return toast ? toast.textContent : ''
  })()`)
  console.log('TOAST=' + after)

  const buf = await page.screenshot({ path: 'progress/_icon_actions.png' })
  console.log('SHOT=' + buf.length)
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
