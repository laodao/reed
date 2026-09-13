/* 块化 BlockViewer 验收（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function clickLeaf(page, name) {
  await page.evaluate((nm) => {
    const l = Array.from(document.querySelectorAll('.tree-leaf')).find(x => x.textContent.includes(nm))
    if (l) l.click()
  }, name)
  await wait(900)
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))
  await page.reload({ waitUntil: 'load' })
  await wait(4000)

  // ===== K-stmt full：反洗钱法（fincompliance）=====
  await page.evaluate('window.location.hash = "#/domain-learning/fincompliance"')
  await wait(4000)
  // 法规依据 分支先展开
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('法规依据'))
    if (b) b.click()
  })()`)
  await wait(400)
  await clickLeaf(page, '反洗钱法')
  const law = await page.evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.block-card')).map(c => {
      const t = c.querySelector('.block-title')
      const v = c.querySelector('.block-variant')
      const bodyVis = c.querySelector('.block-body') ? getComputedStyle(c.querySelector('.block-body')).display !== 'none' : false
      return { title: t ? t.textContent.trim() : '', variant: v ? v.textContent : '', bodyVisible: bodyVis }
    })
    const toc = document.querySelectorAll('.toc-chip').length
    return JSON.stringify({ cardCount: cards.length, toc, cards: cards.slice(0, 12), hasRisk: document.body.innerText.includes('风险红线') })
  })()`)
  console.log('KSTMT_LAW=' + law)

  // ===== K-concept full：MoE（llmfrontier）=====
  await page.evaluate('window.location.hash = "#/domain-learning/llmfrontier"')
  await wait(4000)
  await clickLeaf(page, '混合专家')
  const moe = await page.evaluate(`(() => {
    const titles = Array.from(document.querySelectorAll('.block-title')).map(t => t.textContent.trim())
    const mermaid = document.querySelectorAll('.block-card svg').length
    const collapsed = Array.from(document.querySelectorAll('.block-body')).filter(b => getComputedStyle(b).display === 'none').length
    return JSON.stringify({ titles, mermaidSvg: mermaid, collapsedCount: collapsed })
  })()`)
  console.log('KCONCEPT_MOE=' + moe)

  // 折叠交互：点机制块的折叠按钮展开
  await page.evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.block-card'))
    const mech = cards.find(c => c.querySelector('.block-title') && c.querySelector('.block-title').textContent.includes('机制'))
    const fold = mech ? mech.querySelector('.fold-btn') : null
    if (fold) fold.click()
  })()`)
  await wait(500)
  const mechOpen = await page.evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.block-card'))
    const mech = cards.find(c => c.querySelector('.block-title') && c.querySelector('.block-title').textContent.includes('机制'))
    const body = mech ? mech.querySelector('.block-body') : null
    return body ? getComputedStyle(body).display !== 'none' : false
  })()`)
  console.log('MECH_EXPANDED=' + mechOpen)

  // 这块没懂 反馈
  await page.evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll('.confuse-btn'))
    if (btns[0]) btns[0].click()
  })()`)
  await wait(400)
  const feedback = await page.evaluate('document.body.innerText.includes("已记下")')
  console.log('BLOCK_FEEDBACK=' + feedback)

  // ===== K-concept lite：重排（rag）=====
  await page.evaluate('window.location.hash = "#/domain-learning/rag"')
  await wait(4000)
  await clickLeaf(page, '重排')
  const rerank = await page.evaluate(`(() => {
    const titles = Array.from(document.querySelectorAll('.block-title')).map(t => t.textContent.trim())
    const selfcheck = Array.from(document.querySelectorAll('.block-selfcheck .block-title')).map(t => t.textContent.trim())
    return JSON.stringify({ titles, selfcheck })
  })()`)
  console.log('LITE_RERANK=' + rerank)

  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
