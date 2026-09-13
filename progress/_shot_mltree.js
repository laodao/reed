/* ML 树截图（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  await page.evaluate('window.location.hash = "#/domain-learning"')
  await wait(2500)
  await page.evaluate(`(() => {
    const m = Array.from(document.querySelectorAll('.topic-card')).find(c => c.textContent.includes('机器学习'))
    if (m) m.click()
  })()`)
  await wait(4000)
  let buf = await page.screenshot({ path: 'progress/_ml_tree_collapsed.png' })
  console.log('COLLAPSED=' + buf.length)
  // 展开 深度学习 与 训练与评估
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(n => n.textContent.includes('深度学习'))
    if (b) b.click()
  })()`)
  await wait(500)
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(n => n.textContent.includes('训练与评估'))
    if (b) b.click()
  })()`)
  await wait(500)
  buf = await page.screenshot({ path: 'progress/_ml_tree_expanded.png' })
  console.log('EXPANDED=' + buf.length)
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
