/* 查看块级公式渲染 HTML（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  await page.evaluate('window.location.hash = "#/domain-learning/ml"')
  await wait(3000)
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('数学基础'))
    if (b) b.click()
  })()`)
  await wait(300)
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('概率与统计'))
    if (b) b.click()
  })()`)
  await wait(300)
  await page.evaluate(`(() => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes('贝叶斯定理'))
    if (l) l.click()
  })()`)
  await wait(1200)
  const info = await page.evaluate(`(() => {
    const secs = Array.from(document.querySelectorAll('.sec'))
    const stmt = secs.find(s => (s.querySelector('.sec-title')||{}).textContent === '表述')
    const html = stmt ? stmt.innerHTML : ''
    // 找到公式区前后文
    const idx = html.indexOf('P(A')
    return JSON.stringify({
      hasKatex: html.includes('katex'),
      hasDisplay: html.includes('katex-display'),
      snippet: (idx >= 0 ? html.slice(idx - 60, idx + 200) : html.slice(0, 300))
    })
  })()`)
  console.log('SNIPPET=' + info)
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
