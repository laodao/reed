// M4-C 走查二：Atlas 设置组/KB 下拉/统计 popover/PNG 按钮
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.goto(`http://localhost:5173/#/domain-learning/${SPACE}/atlas`)
  await page.waitForTimeout(2200)

  const opened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.atlas-actions button')].find((b) => b.textContent.includes('空间设置'))
    btn?.click()
    return !!btn
  })
  await page.waitForTimeout(700)
  const groups = await page.evaluate(() => [...document.querySelectorAll('.settings-body .set-title')].map((t) => t.textContent.trim()))

  // 打开 KB 下拉读取可用知识库选项
  const kbSel = await page.evaluate(() => {
    const sel = document.querySelector('.settings-body .el-select')
    if (sel) {
      ;(/** @type {HTMLElement} */ (sel)).click()
      return true
    }
    return false
  })
  await page.waitForTimeout(700)
  const kbOpts = await page.evaluate(() => [...document.querySelectorAll('.el-select-dropdown__item, .el-select-dropdown .el-option')].map((o) => o.textContent.trim()).slice(0, 10))

  // 关闭弹层避免遮挡，再开统计
  await page.evaluate(() => document.body.click())
  await page.waitForTimeout(200)
  const statsBtn = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.atlas-actions button')].find((b) => b.textContent.trim() === '统计')
    btn?.click()
    return !!btn
  })
  await page.waitForTimeout(600)
  const statsRows = await page.evaluate(() => document.querySelectorAll('.stats-body .stat-row').length)
  const pngBtn = await page.evaluate(() => [...document.querySelectorAll('.atlas-actions button')].some((b) => b.textContent.includes('导出 PNG')))
  const digestBtn = await page.evaluate(() => [...document.querySelectorAll('.atlas-actions button')].some((b) => b.textContent.includes('导出讲义')))

  console.log(JSON.stringify({ opened, groups, kbSel, kbOpts, statsBtn, statsRows, pngBtn, digestBtn }, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
