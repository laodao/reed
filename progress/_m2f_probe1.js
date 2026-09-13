// M2-F 探测 1：dev 实例渲染页 + dl:list-spaces / get-space-view 冒烟
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const pages = ctx.pages()
  const page = pages.find((p) => p.url().includes('localhost:5173')) || pages[0]
  await page.waitForLoadState('domcontentloaded')
  console.log('PAGE:', page.url())

  const spaces = await page.evaluate(async () => {
    const dl = window.electronAPI?.domainLearning
    if (!dl) return { err: 'no domainLearning api' }
    const r = await dl.listSpaces()
    if (!r?.success) return { err: r?.error || 'listSpaces fail' }
    const first = r.data?.[0]
    const view = first ? await dl.getSpaceView(first.id) : null
    return {
      count: r.data?.length ?? 0,
      first: first
        ? { id: first.id, name: first.name, status: first.status, profileId: first.profileId }
        : null,
      view: view?.data
        ? {
            name: view.data.name,
            profile: view.data.profile,
            total: view.data.stats?.total,
            mastered: view.data.stats?.mastered,
            openQ: view.data.openQuestionCount,
            treeNodes: view.data.tree?.length,
          }
        : null,
    }
  })
  console.log('RESULT:', JSON.stringify(spaces, null, 2))
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
