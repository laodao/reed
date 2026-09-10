/** P0 验收：bible:list 通道 + 动态分组（国别）真机验证 */
const path = require('path')
const { chromium } = require('@playwright/test')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
  if (!page) throw new Error('no page')
  const call = (expr, ...args) => page.evaluate(({ expr, args }) => {
    const fn = new Function('lw', 'args', `return lw.${expr}(...args)`)
    return fn(window.electronAPI.longwriting, args)
  }, { expr, args })
  const url = (h) => `file://${path.resolve(__dirname, '../out/renderer/index.html')}${h}`
  try {
    const created = await call('createProject', { name: `P0验收-${Date.now() % 10000}`, type: 'story' })
    const pid = created.data.id
    await page.evaluate((h) => { location.hash = h }, `#/longwriting/room/${pid}`)
    await page.reload()
    await page.waitForSelector('.group', { timeout: 15000 })
    await page.waitForTimeout(1000)
    const info = await page.evaluate(() => ({
      groups: [...document.querySelectorAll('.group-head')].map((g) => g.textContent.trim().slice(0, 20)),
      hasNation: !![...document.querySelectorAll('.group-head')].find((g) => g.textContent.includes('国别')),
    }))
    console.log('[p0] 分组:', info.groups.join(' | '))
    console.log('[p0] 国别动态分组:', info.hasNation ? 'PASS' : 'FAIL')
    const list = await call('bibleList', pid)
    console.log('[p0] bibleList keys:', (list.data || []).map((g) => g.kindKey).join(','))
    await page.screenshot({ path: 'docs/screenshot/story-room-04-dynamic-kinds.png' })
    await call('deleteProject', pid)
    await page.evaluate(() => { location.hash = '#/' })
    await page.reload()
    console.log('[p0] done')
  } catch (e) {
    console.error('[p0] FAILED:', e.message)
    process.exitCode = 1
  }
  process.exit(0)
})().catch((e) => { console.error(e.message); process.exit(1) })
