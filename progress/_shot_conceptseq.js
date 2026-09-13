/* 知识点主序列截图（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  await page.evaluate('window.location.hash = "#/domain-learning/rag"')
  await wait(4000)
  await page.evaluate(`(() => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes('向量检索'))
    if (l) l.click()
  })()`)
  await wait(900)
  let b = await page.screenshot({ path: 'progress/_concept_locked.png' })
  console.log('LOCKED=' + b.length)
  // 回首页进机器学习 展示大领域 + 逻辑回归讲义
  await page.evaluate('window.location.hash = "#/domain-learning"')
  await wait(2500)
  await page.evaluate(`(() => {
    const m = Array.from(document.querySelectorAll('.topic-card')).find(c => c.textContent.includes('机器学习'))
    if (m) m.click()
  })()`)
  await wait(4000)
  await page.evaluate(`(() => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes('逻辑回归'))
    if (l) l.click()
  })()`)
  await wait(900)
  b = await page.screenshot({ path: 'progress/_concept_lesson.png' })
  console.log('LESSON=' + b.length)
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
