// M5 走查三:点「生成首批知识」→ 会话结束 → 必须出现原因反馈(boot-message)或概念产出
const { chromium } = require('playwright-core')
const SPACE = '7e5fa676-4d0a-49eb-b4c3-0c38cbb2d4fe'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.goto(`http://localhost:5173/#/domain-learning/${SPACE}`)
  await page.waitForTimeout(2600)
  const idle = await page.evaluate(() => ({
    boot: !!document.querySelector('.boot-card'),
    btn: [...document.querySelectorAll('.boot-card button')].map((b) => b.textContent.trim()),
  }))
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.boot-card button')].find((b) => b.textContent.includes('生成首批知识'))
    btn?.click()
    return !!btn
  })
  console.log(JSON.stringify({ idle, clicked }, null, 2))

  // 轮询:等会话结束(loading 按钮消失)后读反馈
  let final = null
  for (let i = 0; i < 32; i++) {
    await page.waitForTimeout(15000)
    const s = await page.evaluate(() => ({
      boot: !!document.querySelector('.boot-card'),
      btn: [...document.querySelectorAll('.boot-card button')].map((b) => b.textContent.trim()),
      msg: document.querySelector('.boot-message')?.textContent?.trim()?.slice(0, 300) ?? '',
      leaves: document.querySelectorAll('.tree-leaf').length,
      conceptName: document.querySelector('.lesson-head h3')?.textContent?.trim() ?? '',
    }))
    const done =
      (s.boot && s.btn.length > 0 && !s.btn.some((t) => t.includes('正在研究'))) ||
      (!s.boot && s.leaves > 0)
    if (done) {
      final = s
      break
    }
  }
  if (!final) {
    final = await page.evaluate(() => ({
      boot: !!document.querySelector('.boot-card'),
      btn: [...document.querySelectorAll('.boot-card button')].map((b) => b.textContent.trim()),
      msg: document.querySelector('.boot-message')?.textContent?.trim()?.slice(0, 300) ?? '',
      leaves: document.querySelectorAll('.tree-leaf').length,
    }))
    final.timeout = true
  }
  console.log(JSON.stringify({ final }, null, 2))
  await page.screenshot({ path: 'progress/_m5_boot_feedback.png' })
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
