// 资产中心打开性能实测：记录 preview-render IPC 是否被触发 + 页面首屏渲染
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0]

  // 挂探针：统计 asset:preview-render 调用次数（实时渲染长图=慢的根源）
  await page.evaluate(() => {
    window.__probe = { previewRenderCalls: 0, previewRenderMs: 0 }
    const orig = window.electronAPI.assets.previewRender.bind(window.electronAPI.assets)
    window.electronAPI.assets.previewRender = async (id) => {
      window.__probe.previewRenderCalls++
      const t0 = performance.now()
      const r = await orig(id)
      window.__probe.previewRenderMs += performance.now() - t0
      return r
    }
  })

  const t0 = Date.now()
  await page.evaluate(() => { window.location.hash = '#/assets' })
  await page.waitForTimeout(2500)
  const probe = await page.evaluate(() => window.__probe)
  console.log('open assets took ms ~', Date.now() - t0, '| previewRender calls during open:', probe.previewRenderCalls, '| total ms:', Math.round(probe.previewRenderMs))

  // 断言资产卡片区渲染
  const info = await page.evaluate(() => ({
    cards: document.querySelectorAll('.asset-card').length,
    hasGrid: !!document.querySelector('.asset-grid'),
    loadingEl: !!document.querySelector('.el-loading-mask'),
  }))
  console.log('asset cards visible:', JSON.stringify(info))
  await page.screenshot({ path: 'progress/report-assets-open.png' })
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
