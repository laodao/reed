/* v4 模板 + 公式截图（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  await page.evaluate('window.location.hash = "#/domain-learning/ml"')
  await wait(3000)
  await page.evaluate(`(() => { const b=[...document.querySelectorAll('.tree-branch')].find(x=>x.textContent.includes('数学基础')); if(b)b.click() })()`)
  await wait(300)
  await page.evaluate(`(() => { const b=[...document.querySelectorAll('.tree-branch')].find(x=>x.textContent.includes('概率与统计')); if(b)b.click() })()`)
  await wait(300)
  await page.evaluate(`(() => { const l=[...document.querySelectorAll('.tree-leaf')].find(x=>x.textContent.includes('贝叶斯定理')); if(l)l.click() })()`)
  await wait(1500)
  await page.evaluate(`(() => { const f=document.querySelector('.fold-hint'); if(f)f.click() })()`)
  await wait(700)
  let buf = await page.screenshot({ path: 'progress/_v4_bayes_math.png' })
  console.log('BAYES=' + buf.length)
  await page.evaluate('window.location.hash = "#/domain-learning/llmfrontier"')
  await wait(3000)
  await page.evaluate(`(() => { const l=[...document.querySelectorAll('.tree-leaf')].find(x=>x.textContent.includes('混合专家')); if(l)l.click() })()`)
  await wait(1500)
  buf = await page.screenshot({ path: 'progress/_v4_moe_template.png' })
  console.log('MOE=' + buf.length)
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
