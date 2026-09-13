// M3-B CDP：启用复习(60min) → review-due → review-done 一条 → 队列刷新
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = null || (ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0])
  await page.waitForLoadState('domcontentloaded')
  const out = await page.evaluate(async (spaceId) => {
    const dl = window.electronAPI?.domainLearning
    const saved = (await dl.setSpaceReview({ id: spaceId, review: { enabled: true, intervalMin: 60, limit: 5 } }))?.data
    const due1 = (await dl.reviewDue(spaceId))?.data ?? null
    let done = null
    if (due1?.items?.length) {
      const first = due1.items[0]
      const r = await dl.reviewDone({ id: spaceId, conceptId: first.conceptId })
      done = { conceptId: first.conceptId, ok: r?.data?.ok ?? false }
      // 完成后再查（若只有这一条 → 队列应空）
      done.after = (await dl.reviewDue(spaceId))?.data?.items?.map((i) => i.conceptId) ?? null
    }
    const settingsBack = (await dl.getSpaceReview(spaceId))?.data ?? null
    return { saved, dueItems: (due1?.items ?? []).map((i) => ({ id: i.conceptId, name: i.name, mastery: i.mastery })), done, settingsBack }
  }, SPACE)
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
