/* 四区讲义截图（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  await page.evaluate('window.location.hash = "#/domain-learning/llmfrontier"')
  await wait(3500)
  await page.evaluate(`(() => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes('混合专家'))
    if (l) l.click()
  })()`)
  await wait(1500)
  let buf = await page.screenshot({ path: 'progress/_4sec_moe.png' })
  console.log('MOE=' + buf.length)
  await page.evaluate('window.location.hash = "#/domain-learning/fincompliance"')
  await wait(3500)
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('法规依据'))
    if (b) b.click()
  })()`)
  await wait(400)
  await page.evaluate(`(() => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes('反洗钱法'))
    if (l) l.click()
  })()`)
  await wait(1500)
  buf = await page.screenshot({ path: 'progress/_4sec_law.png' })
  console.log('LAW=' + buf.length)
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
