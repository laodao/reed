// M2-F 探测 7：列出 open 未解问题并自动选择首个，触发 research+focusQuestionId
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const out = await page.evaluate(async (spaceId) => {
    const dl = window.electronAPI?.domainLearning
    const rows = (await dl.listQuestions(spaceId))?.data ?? []
    const open = rows.filter((r) => r.status === 'open')
    return open.map((r) => ({ id: r.id, conceptId: r.conceptId, q: r.question.slice(0, 120), at: r.createdAt }))
  }, SPACE)
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
