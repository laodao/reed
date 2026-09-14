/* rerank lite 排查（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
  await page.evaluate('window.location.hash = "#/domain-learning/rag"')
  await wait(4000)
  // 展开检索链路分支
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('检索链路'))
    if (b) b.click()
  })()`)
  await wait(500)
  // 列出可见叶子
  const leaves = await page.evaluate('JSON.stringify(Array.from(document.querySelectorAll(".tree-leaf")).map(l => l.textContent.trim()))')
  console.log('LEAVES=' + leaves)
  await page.evaluate(`(() => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes('重排'))
    if (l) l.click()
  })()`)
  await wait(900)
  const st = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    const h = document.querySelector('.lesson-title h3')
    const cards = document.querySelectorAll('.block-card').length
    return JSON.stringify({
      head: h ? h.textContent : '',
      hasCard: cards,
      hasSelfcheck: has('自测'),
      hasEmpty: has('讲义生成中'),
      hasRerankText: has('重排（Rerank）')
    })
  })()`)
  console.log('STATE=' + st)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
