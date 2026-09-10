/** 探查：当前页面 hash / 渲染器版本 / 可见内容 */
const path = require('path')
const { chromium } = require('@playwright/test')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('index.html'))
  if (!page) { console.log('no page'); process.exit(0) }
  console.log('url:', page.url())
  const info = await page.evaluate(() => ({
    hash: location.hash,
    title: document.title,
    hasLwApi: !!window.electronAPI?.longwriting,
    hasRoomApi: typeof window.electronAPI?.longwriting?.roomSend,
    bodyText: document.body.innerText.slice(0, 200).replace(/\n/g, ' | '),
  }))
  console.log(JSON.stringify(info, null, 2))
  await page.screenshot({ path: path.resolve(__dirname, '../docs/screenshot/story-room-probe.png') })
  process.exit(0)
})().catch((e) => { console.error('probe ERR:', e.message); process.exit(1) })
