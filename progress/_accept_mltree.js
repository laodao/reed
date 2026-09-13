/* 学习空间大纲树验收（临时脚本） */
const { chromium } = require('playwright-core')
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]
  if (!page) { console.log('NO_PAGE'); return }
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message))

  // 列表应有 5 个主题
  await page.evaluate('window.location.hash = "#/domain-learning"')
  await wait(3000)
  const cardCount = await page.evaluate('document.querySelectorAll(".topic-card").length')
  const hasMl = await page.evaluate('document.body.innerText.includes("机器学习 · 从基础到深度")')
  console.log('LIST cards=' + cardCount + ' hasMl=' + hasMl)

  // 进入 ml 空间
  await page.evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.topic-card'))
    const m = cards.find(c => c.textContent.includes('机器学习 · 从基础到深度'))
    if (m) m.click()
  })()`)
  await wait(4000)

  const treeInfo = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    const branches = Array.from(document.querySelectorAll('.tree-branch')).map(b => b.textContent)
    const leaves = document.querySelectorAll('.tree-leaf').length
    return JSON.stringify({
      hash: location.hash,
      title: has('机器学习 · 从基础到深度'),
      branches: branches,
      leafCount: leaves,
      stats: has('/')
    })
  })()`)
  console.log('TREE=' + treeInfo)

  // 折叠交互：点「监督学习」分支展开
  await page.evaluate(`(() => {
    const bs = Array.from(document.querySelectorAll('.tree-branch'))
    const b = bs.find(x => x.textContent.includes('监督学习'))
    if (b) b.click()
  })()`)
  await wait(600)
  const afterExpand = await page.evaluate(`(() => {
    const has = (s) => document.body.innerText.includes(s)
    return JSON.stringify({
      moduleRows: has('回归') || has('分类') || has('集成学习'),
      leafNow: document.querySelectorAll('.tree-leaf').length
    })
  })()`)
  console.log('EXPAND=' + afterExpand)

  // 搜索过滤
  await page.evaluate(`(() => {
    const input = document.querySelector('.map-filters input')
    if (input) {
      input.value = 'transformer'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })()`)
  await wait(800)
  const searchInfo = await page.evaluate(`(() => {
    const leaves = Array.from(document.querySelectorAll('.tree-leaf')).map(l => l.textContent)
    const branches = Array.from(document.querySelectorAll('.tree-branch')).map(b => b.textContent)
    return JSON.stringify({ leaves, branches })
  })()`)
  console.log('SEARCH=' + searchInfo)

  // 掌握度过滤：只看待学
  await page.evaluate(`(() => {
    const input = document.querySelector('.map-filters input')
    if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })) }
  })()`)
  await wait(400)
  await page.evaluate(`(() => {
    const sel = document.querySelector('.map-filters .el-select')
    sel && sel.click()
  })()`)
  await wait(500)
  await page.evaluate(`(() => {
    const opts = Array.from(document.querySelectorAll('.el-select-dropdown__item'))
    const o = opts.find(x => x.textContent.trim() === '待学')
    if (o) o.click()
  })()`)
  await wait(800)
  const filterInfo = await page.evaluate(`(() => {
    const leaves = Array.from(document.querySelectorAll('.tree-leaf'))
    const noneMastered = leaves.every(l => !l.classList.contains('dot-mastered'))
    return JSON.stringify({ leafCount: leaves.length })
  })()`)
  console.log('FILTER_TODO=' + filterInfo)

  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
