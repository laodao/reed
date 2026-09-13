// M2-F 探测 10：重启持久化复验 —— pace/profile/新数据/调度状态
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.waitForLoadState('domcontentloaded')
  await page.goto(`http://localhost:5173/#/domain-learning/${SPACE}/atlas`)
  await page.waitForTimeout(1800)

  const out = await page.evaluate(async (spaceId) => {
    const dl = window.electronAPI?.domainLearning
    const pace = (await dl.getSpacePace(spaceId))?.data ?? null
    const sched = (await dl.schedulerState())?.data ?? null
    const v = (await dl.getSpaceView(spaceId))?.data ?? null
    const views = (await dl.getAtlasViews(spaceId))?.data ?? null
    const concepts = v?.concepts ?? []
    const newConcept = concepts.find((c) => c.name === '全概率公式')
    const cards = concepts.filter((c) => c.hasCard)
    return {
      spacesStill1: ((await dl.listSpaces())?.data ?? []).length,
      pace,
      scheduler: sched,
      profile: v?.profile ?? null,
      total: v?.stats?.total,
      mastered: v?.stats?.mastered,
      hasNewConcept: !!newConcept,
      newConceptCard: !!newConcept?.hasCard,
      conceptsWithCard: cards.length,
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
