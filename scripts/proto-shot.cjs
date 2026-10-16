// 截取应用模块原型三屏为 PNG（供查看/评审）
const { chromium } = require('playwright')
const path = require('path')

const URL = 'file:///' + path.resolve('docs/prototype/app-module/index.html').replace(/\\/g, '/')

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  // 关闭固定导航条（避免盖住内容）
  await page.addStyleTag({ content: '.proto-bar { display: none !important; }' })
  const shots = [
    ['s1', 'prototype-1-list'],
    ['s2', 'prototype-2-detail'],
    ['s3', 'prototype-3-session'],
  ]
  for (const [id, name] of shots) {
    await page.goto(URL)
    await page.evaluate(x => document.getElementById(x).classList.add('show'), id)
    await page.waitForTimeout(300)
    if (id === 's3') {
      // 会话屏用全页截长图
      await page.screenshot({ path: `docs/prototype/app-module/${name}.png`, fullPage: true })
    } else {
      await page.screenshot({ path: `docs/prototype/app-module/${name}.png` })
    }
    console.log('saved', name)
  }
  await browser.close()
})().catch(e => { console.error('ERR', e.message); process.exit(1) })