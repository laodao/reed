/* 检查块级公式 katex-display（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  await page.evaluate('window.location.hash = "#/domain-learning/ml"')
  await wait(3500)
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('数学基础'))
    if (b) b.click()
  })()`)
  await wait(400)
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('概率与统计'))
    if (b) b.click()
  })()`)
  await wait(400)
  await page.evaluate(`(() => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes('贝叶斯定理'))
    if (l) l.click()
  })()`)
  await wait(1500)
  // 展开证明折叠看块级公式
  await page.evaluate(`(() => {
    const f = document.querySelector('.fold-hint')
    if (f) f.click()
  })()`)
  await wait(800)
  const info = await page.evaluate(`(() => {
    const kd = document.querySelectorAll('.katex-display').length
    const html = document.querySelector('.markdown-body, .bytemd-preview')?.innerHTML || ''
    const hasDollar = html.includes('P(A')
    const m = html.match(/katex-display[^>]*>([^<]{0,60})/)
    return JSON.stringify({
      katexDisplayCount: kd,
      hasKatexClass: html.includes('class="katex'),
      sampleDollar: html.slice(0, 200).includes('$$'),
      katexHtmlSample: (m ? m[1] : '').slice(0, 80)
    })
  })()`)
  console.log('DISPLAY=' + info)
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
