/* Bayes K-stmt 数学补测（展开分支后）（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
  await page.reload({ waitUntil: 'load' })
  await wait(3500)
  await page.evaluate('window.location.hash = "#/domain-learning/ml"')
  await wait(4000)
  // 展开 数学基础 → 概率与统计 模块
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('数学基础'))
    if (b) b.click()
  })()`)
  await wait(500)
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('概率与统计'))
    if (b) b.click()
  })()`)
  await wait(500)
  await page.evaluate(`(() => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes('贝叶斯定理'))
    if (l) l.click()
  })()`)
  await wait(1500)
  const bayes = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    const secTitles = Array.from(document.querySelectorAll('.sec-title')).map(t => t.textContent)
    const katex = document.querySelectorAll('.katex').length
    const katexDisplay = document.querySelectorAll('.katex-display').length
    return JSON.stringify({
      secTitles,
      katex, katexDisplay,
      foldHint: document.querySelectorAll('.fold-hint').length,
      works: has('Thomas Bayes') && has('Doctrine of Chances'),
      formulaShown: has('后验')
    })
  })()`)
  console.log('BAYES=' + bayes)
  // 展开证明折叠
  await page.evaluate(`(() => {
    const f = document.querySelector('.fold-hint')
    if (f) f.click()
  })()`)
  await wait(500)
  const opened = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    return has('由条件概率定义出发')
  })()`)
  console.log('PROOF_OPEN=' + opened)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
