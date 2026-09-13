/* 四区讲义验收（临时脚本） */
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
  await wait(4000)

  // MoE（llmfrontier）四区
  await page.evaluate('window.location.hash = "#/domain-learning/llmfrontier"')
  await wait(4000)
  await page.evaluate(`(() => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes('混合专家'))
    if (l) l.click()
  })()`)
  await wait(1200)
  const moe = await page.evaluate(`(() => {
    const secs = Array.from(document.querySelectorAll('.sec'))
    const confuses = document.querySelectorAll('.sec-confuse').length
    return JSON.stringify({
      essence: secs.length >= 1 && secs[0].textContent.includes('多个'),
      detailMermaid: document.querySelectorAll('.sec-detail svg').length,
      edge: (secs.find(s => s.classList.contains('sec-edge')) || {}).textContent ? 'yes' : 'no',
      hasReviewTitle: Array.from(document.querySelectorAll('.sec-title')).map(t => t.textContent).join('|'),
      confuseButtons: confuses,
      sectionCount: secs.length
    })
  })()`)
  console.log('MOE_4SEC=' + moe)

  // Law（fincompliance）四区
  await page.evaluate('window.location.hash = "#/domain-learning/fincompliance"')
  await wait(4000)
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('法规依据'))
    if (b) b.click()
  })()`)
  await wait(400)
  await page.evaluate(`(() => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes('反洗钱法'))
    if (l) l.click()
  })()`)
  await wait(1200)
  const law = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    return JSON.stringify({
      essence: has('法律源头'),
      detail: has('核心条款'),
      edge: has('风险红线'),
      review: has('自测'),
      confuse: document.querySelectorAll('.sec-confuse').length,
      noStatutoryBadge: !document.body.innerText.includes('statutory')
    })
  })()`)
  console.log('LAW_4SEC=' + law)

  // 这块没懂
  await page.evaluate(`(() => {
    const btns = document.querySelectorAll('.sec-confuse')
    if (btns[0]) btns[0].click()
  })()`)
  await wait(400)
  const feedback = await page.evaluate('document.body.innerText.includes("已记下")')
  console.log('FEEDBACK=' + feedback)

  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
