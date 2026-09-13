// M2-F 探测 2：pace 设置/画像设置/get-atlas-views/scheduler-state（确定性 IPC 验收）
const { chromium } = require('playwright-core')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:5173')) || ctx.pages()[0]
  await page.waitForLoadState('domcontentloaded')

  const out = await page.evaluate(async (spaceId) => {
    const dl = window.electronAPI?.domainLearning
    const j = async (fn) => {
      try {
        const r = await fn()
        return { ok: !!r?.success, data: r?.data ?? null, err: r?.error ?? null }
      } catch (e) {
        return { ok: false, err: String(e) }
      }
    }
    const paceBefore = await j(() => dl.getSpacePace(spaceId))
    const savedPace = await j(() =>
      dl.setSpacePace({
        id: spaceId,
        pace: { enabled: true, intervalMin: 5, autoResearchConcepts: true, autoResolveOpenQuestions: true },
      }),
    )
    const scheduler = await j(() => dl.schedulerState())
    const prof = await j(() =>
      dl.setSpaceProfile({
        id: spaceId,
        profileId: 'theory',
        profile: { kindLabel: '理论体系', nature: '概念—命题—推演层层递进，重视结构与证明链', emphasis: ['流程', '三层结构'] },
      }),
    )
    const spaceView = await j(() => dl.getSpaceView(spaceId))
    const views = await j(() => dl.getAtlasViews(spaceId))
    return { paceBefore, savedPace, scheduler, prof, profile: spaceView.data?.profile ?? null, views }
  }, SPACE)

  console.log(JSON.stringify(out, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
