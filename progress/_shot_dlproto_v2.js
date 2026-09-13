/* 全景图截图（临时脚本不入库） */
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  await page.evaluate('window.location.hash = "#/domain-learning/rag"')
  await new Promise(r => setTimeout(r, 4000))
  await page.evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll('.space-header button'))
    const g = btns.find(b => b.textContent.includes('知识全景'))
    if (g) g.click()
  })()`)
  await new Promise(r => setTimeout(r, 4000))
  const buf = await page.screenshot({ path: 'progress/_dlproto_graph.png' })
  console.log('GRAPH_SHOT bytes=' + buf.length)
  // 列表页截图
  await page.evaluate('window.location.hash = "#/domain-learning"')
  await new Promise(r => setTimeout(r, 3000))
  const buf2 = await page.screenshot({ path: 'progress/_dlproto_home.png' })
  console.log('HOME_SHOT bytes=' + buf2.length)
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
