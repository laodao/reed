/* 硬刷新 + ML 树验收（临时脚本） */
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
  await wait(5000)

  await page.evaluate('window.location.hash = "#/domain-learning"')
  await wait(3500)
  const cardCount = await page.evaluate('document.querySelectorAll(".topic-card").length')
  const hasMl = await page.evaluate('document.body.innerText.includes("机器学习 · 从基础到深度")')
  console.log('LIST cards=' + cardCount + ' hasMl=' + hasMl)

  await page.evaluate(`(() => {
    const m = Array.from(document.querySelectorAll('.topic-card')).find(c => c.textContent.includes('机器学习 · 从基础到深度'))
    if (m) m.click()
  })()`)
  await wait(4000)
  const t1 = await page.evaluate(`(() => {
    const branches = Array.from(document.querySelectorAll('.tree-branch')).map(b => b.textContent.trim())
    const leaves = Array.from(document.querySelectorAll('.tree-leaf')).map(l => l.textContent.trim())
    return JSON.stringify({ branches, leaves, leafCount: leaves.length })
  })()`)
  console.log('TREE=' + t1)

  // 展开「深度学习」分支
  await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('.tree-branch')).find(x => x.textContent.includes('深度学习'))
    if (b) b.click()
  })()`)
  await wait(600)
  const t2 = await page.evaluate('JSON.stringify(Array.from(document.querySelectorAll(".tree-branch")).map(b => b.textContent.trim()))')
  console.log('AFTER_EXPAND=' + t2)

  // 掌握度过滤 = 待学（应强制展开命中分支）
  await page.evaluate(`(() => {
    const sel = document.querySelector('.map-filters .el-select')
    sel && sel.click()
  })()`)
  await wait(500)
  await page.evaluate(`(() => {
    const o = Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(x => x.textContent.trim() === '待学')
    if (o) o.click()
  })()`)
  await wait(900)
  const t3 = await page.evaluate(`(() => {
    const leaves = Array.from(document.querySelectorAll('.tree-leaf')).map(l => l.textContent.trim())
    const branches = Array.from(document.querySelectorAll('.tree-branch')).map(b => b.textContent.trim())
    return JSON.stringify({ branchCount: branches.length, leafCount: leaves.length, leafSample: leaves.slice(0, 6) })
  })()`)
  console.log('FILTER_TODO=' + t3)
  console.log('ERRORS=' + JSON.stringify(errors))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
