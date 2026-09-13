// M2-F 探测 5：轮询自动研究直至完成（busy=false），汇总动作与落卡情况
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'
const CONCEPT = '16943f19-2e1f-46d0-981c-25d864f0b655'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.waitForLoadState('domcontentloaded')

  const started = Date.now()
  let lastBusy = true
  while (Date.now() - started < 8 * 60 * 1000) {
    const s = await page.evaluate(async (args) => {
      const dl = window.electronAPI?.domainLearning
      const { spaceId, conceptId } = args
      const busy = await dl.agentBusy({ mode: 'research', spaceId, conceptId })
      const v = (await dl.getSpaceView(spaceId))?.data
      const c = v?.concepts?.find((x) => x.id === conceptId)
      return { busy: busy?.data === true, hasCard: !!c?.hasCard, researchState: c?.researchState, mastery: c?.mastery }
    }, { spaceId: SPACE, conceptId: CONCEPT })
    if (!s.busy && s.hasCard) {
      // 完成后拉取最终结果
      const fin = await page.evaluate(async () => window.__m2fR ?? null)
      console.log('DONE_BUSY_FALSE_CARD:', JSON.stringify({ ...s, waitedSec: Math.round((Date.now() - started) / 1000), result: fin }, null, 2))
      await browser.close()
      return
    }
    lastBusy = s.busy
    if (!s.busy && !s.hasCard) {
      const fin = await page.evaluate(async () => window.__m2fR ?? null)
      console.log('DONE_BUSY_FALSE_NO_CARD:', JSON.stringify({ ...s, waitedSec: Math.round((Date.now() - started) / 1000), result: fin }, null, 2))
      await browser.close()
      return
    }
    await page.waitForTimeout(12000)
  }
  console.log('POLL_TIMEOUT lastBusy=', lastBusy)
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
