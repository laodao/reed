// M5 走查二:空主题(7e5fa676)boot 卡渲染 + 触发生成首批知识并观察
const { chromium } = require('playwright-core')
const SPACE = '7e5fa676-4d0a-49eb-b4c3-0c38cbb2d4fe'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.goto(`http://localhost:5173/#/domain-learning/${SPACE}`)
  await page.waitForTimeout(2800)

  const space = await page.evaluate(() => ({
    bootCard: !!document.querySelector('.boot-card'),
    bootTitle: document.querySelector('.boot-card h3')?.textContent?.trim() ?? '',
    bootTip: !!document.querySelector('.boot-card .boot-tip'),
    bootBtns: [...(document.querySelectorAll('.boot-card button') ?? [])].map((b) => b.textContent.trim()),
    emptyText: document.querySelector('.pane-lesson .el-empty')?.textContent?.trim() ?? '',
    groups: document.querySelectorAll('.tree-branch').length,
    leaves: document.querySelectorAll('.tree-leaf').length,
  }))
  await page.screenshot({ path: 'progress/_m5_boot_card.png' })
  console.log(JSON.stringify({ space }, null, 2))

  let clicked = false
  if (space.bootCard) {
    clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.boot-card button')].find((b) => b.textContent.includes('生成首批知识'))
      btn?.click()
      return !!btn
    })
  }
  await page.waitForTimeout(1800)
  const mid = await page.evaluate(() => ({
    btn: [...document.querySelectorAll('.boot-card button')].map((b) => b.textContent.trim()),
    msg: document.querySelector('.boot-message')?.textContent?.trim() ?? '',
    bootStill: !!document.querySelector('.boot-card'),
  }))
  console.log(JSON.stringify({ mid }, null, 2))

  // 观察会话推进:每 20s 采样一次,最长 140s
  const samples = []
  for (let i = 0; i < 7; i++) {
    await page.waitForTimeout(20000)
    const s = await page.evaluate(() => ({
      t: new Date().toISOString().slice(11, 19),
      bootStill: !!document.querySelector('.boot-card'),
      btn: [...document.querySelectorAll('.boot-card button')].map((b) => b.textContent.trim()),
      msg: document.querySelector('.boot-message')?.textContent?.trim() ?? '',
      leaves: document.querySelectorAll('.tree-leaf').length,
      currentConcept: !!document.querySelector('.lesson-head h3'),
      conceptName: document.querySelector('.lesson-head h3')?.textContent?.trim() ?? '',
      bodyCard: !!document.querySelector('.lesson-body .section-lesson, .lesson-body .markdown-viewer'),
    }))
    samples.push(s)
    if (!s.bootStill && s.leaves > 0) break
  }
  console.log(JSON.stringify({ samples }, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
