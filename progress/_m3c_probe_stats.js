// M3-C CDP：get-space-stats / export-lesson-digest 真机复验
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const out = await page.evaluate(async (spaceId) => {
    const dl = window.electronAPI?.domainLearning
    const stats = (await dl.getSpaceStats(spaceId))?.data ?? null
    const dig = (await dl.exportLessonDigest(spaceId))?.data ?? null
    return {
      stats: stats
        ? {
            total: stats.concepts.total,
            mastered: stats.concepts.mastered,
            learning: stats.concepts.learning,
            review: stats.concepts.review,
            cards: stats.cards,
            openQ: stats.questions.open,
            prereq: stats.relations.prerequisite,
            reviewDueCount: stats.reviewDueCount,
          }
        : null,
      digest: dig
        ? { count: dig.count, filename: dig.filename, len: dig.markdown.length, head: dig.markdown.slice(0, 120), hasBayes: dig.markdown.includes('贝叶斯'), hasEvidence: dig.markdown.includes('证据来源') }
        : null,
    }
  }, SPACE)
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
