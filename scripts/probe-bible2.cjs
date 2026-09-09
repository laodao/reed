const path = require('path')
const { chromium } = require('@playwright/test')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
  const call = (expr, ...args) => page.evaluate(({ expr, args }) => {
    const fn = new Function('lw', 'args', `return lw.${expr}(...args)`)
    return fn(window.electronAPI.longwriting, args)
  }, { expr, args })
  const created = await call('createProject', { name: `P0探针-${Date.now() % 10000}`, type: 'story' })
  const pid = created.data.id
  const list = await call('bibleList', pid)
  console.log('bibleList success:', list.success, '| groups:', (list.data || []).map((g) => `${g.kindKey}(${g.entries.length})`).join(','))
  if (!list.success) console.log('error:', list.error)
  const url = `file://${path.resolve(__dirname, '../out/renderer/index.html')}#/longwriting/room/${pid}`
  await page.evaluate((h) => { location.hash = h }, `#/longwriting/room/${pid}`)
  await page.reload()
  await page.waitForTimeout(2500)
  console.log('hash:', await page.evaluate(() => location.hash))
  console.log('group heads:', await page.evaluate(() => [...document.querySelectorAll('.group-head')].map((g) => g.textContent.trim().slice(0, 14)).join(' | ')))
  console.log('panel text head:', await page.evaluate(() => document.querySelector('.side')?.textContent?.slice(0, 120)?.replace(/\n/g, '|')))
  await page.evaluate((id) => window.electronAPI.longwriting.deleteProject(id), pid)
  process.exit(0)
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
