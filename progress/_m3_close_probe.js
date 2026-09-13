// M3 收口 CDP:Atlas 顶栏 统计/导出按钮 + PNG 下载 + 复习组同屏复核
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.goto(`http://localhost:5173/#/domain-learning/${SPACE}/atlas`)
  await page.waitForTimeout(2000)

  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('.atlas-actions button')].map((b) => b.textContent.trim()).filter(Boolean),
  )
  // 打开统计 popover
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.atlas-actions button')].find((x) => x.textContent.trim() === '统计')
    b?.click()
  })
  await page.waitForTimeout(700)
  const stats = await page.evaluate(() => ({
    rows: document.querySelectorAll('.stats-body .stat-row').length,
    text: document.querySelector('.stats-body')?.textContent?.slice(0, 120) ?? '',
  }))
  // 导出 PNG：捕获 download
  const dl = new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve({ timeout: true }), 15000)
    page.once('download', async (d) => {
      clearTimeout(t)
      resolve({ suggested: d.suggestedFilename(), status: (await d.failure()) || null })
    })
  })
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.atlas-actions button')].find((x) => x.textContent.trim() === '导出 PNG')
    b?.click()
  })
  const png = await dl

  // 空间设置内复习组存在性
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.atlas-actions button')].find((x) => x.textContent.includes('空间设置'))
    b?.click()
  })
  await page.waitForTimeout(700)
  const revGroup = await page.evaluate(() => ({
    hasTitle: !!document.querySelector('.settings-body'),
    reviewBlock: [...document.querySelectorAll('.settings-body .set-title')].map((t) => t.textContent.trim()),
    dueItemCount: document.querySelectorAll('.review-item').length,
  }))

  console.log(JSON.stringify({ btns, stats, png, revGroup }, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
