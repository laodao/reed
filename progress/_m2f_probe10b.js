// M2-F 探测 10b：重启持久化复验（稳健版）
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  // 等待渲染页出现（重启后可能只有背景页）
  let page = null
  for (let i = 0; i < 20; i++) {
    page = ctx.pages().find((p) => p.url().includes('localhost:5173'))
    if (page) break
    await new Promise((r) => setTimeout(r, 1000))
  }
  if (!page) {
    console.log('NO_RENDERER_PAGE; pages=', ctx.pages().map((p) => p.url()))
    await browser.close()
    return
  }
  await page.waitForLoadState('domcontentloaded')
  await new Promise((r) => setTimeout(r, 800))

  const out = await page.evaluate(async (spaceId) => {
    const dl = window.electronAPI?.domainLearning
    const pace = (await dl.getSpacePace(spaceId))?.data ?? null
    const sched = (await dl.schedulerState())?.data ?? null
    const v = (await dl.getSpaceView(spaceId))?.data ?? null
    const views = (await dl.getAtlasViews(spaceId))?.data ?? null
    const newConcept = v?.concepts?.find((c) => c.name === '全概率公式') ?? null
    return {
      url: location.hash || '(home)',
      pace,
      scheduler: sched,
      profile: v?.profile ?? null,
      total: v?.stats?.total,
      mastered: v?.stats?.mastered,
      hasNewConcept: !!newConcept,
      newConceptCard: !!newConcept?.hasCard,
      cards: (v?.concepts ?? []).filter((c) => c.hasCard).length,
      openQ: v?.openQuestionCount,
      viewsEnabled: views?.enabled ?? null,
    }
  }, SPACE)
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
