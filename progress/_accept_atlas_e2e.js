/* Atlas 全链路最终验收（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))

  // 空间列表应有 4 个主题
  await page.evaluate('window.location.hash = "#/domain-learning"')
  await wait(3000)
  const cards = await page.evaluate(`(() => {
    const names = Array.from(document.querySelectorAll('.topic-card')).map(c => (c.textContent || '').slice(0, 30))
    return JSON.stringify(names)
  })()`)
  console.log('SPACES=' + cards)

  // T7 大模型：进入空间页 → 知识全景 → Atlas
  await page.evaluate('window.location.hash = "#/domain-learning/llmfrontier"')
  await wait(3000)
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.space-header button')).find(x => x.textContent.includes('知识全景'))
    if (b) b.click()
  })()`)
  await wait(4500)
  const t7 = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    const nodes = document.querySelectorAll('.graph-node').length
    const paperColored = Array.from(document.querySelectorAll('.graph-node')).filter(n => n.textContent.includes('o1') || n.textContent.includes('Scaling'))
    const c = paperColored[0] ? paperColored[0].querySelector('circle') : null
    let color = ''
    if (c) { color = c.getAttribute('fill') }
    return JSON.stringify({ hash: location.hash, nodes, paperColor: color, profile: has('论文驱动'), bench: has('MMLU') })
  })()`)
  console.log('T7_ATLAS=' + t7)
  const buf = await page.screenshot({ path: 'progress/_atlas_t7_final.png' })
  console.log('T7_SHOT=' + buf.length)

  // 论文节点类型着色应与 ATLAS 论文色一致 (#F0A020)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
