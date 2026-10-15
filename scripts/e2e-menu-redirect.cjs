// 能力入口恢复验证（2026-10-15）：图像生成/文档翻译/语音助手独立菜单与页面
// 前身为「阶段三」菜单精简 + 路由重定向验证脚本（重定向已被真实页面取代）
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  // 1. 首页功能卡片（菜单数据源同侧边栏）应包含恢复的三个能力入口
  await page.evaluate(() => { window.location.hash = '#/' })
  await page.waitForTimeout(800)
  const home = await page.evaluate(() => (document.body.innerText || ''))
  for (const n of ['图像生成', '文档翻译', '语音助手']) {
    assert(home.includes(n), `首页缺少恢复的能力入口「${n}」`)
  }
  console.log('首页含 图像生成/文档翻译/语音助手 ✅')

  // 2. 独立能力页真实可达（不再重定向到 /apps）
  for (const [path, keyword] of [['/image', '图像'], ['/translate', '翻译'], ['/voice/tts', '语音'], ['/voice/clone', '复刻']]) {
    await page.evaluate(p => { window.location.hash = p }, path)
    await page.waitForTimeout(900)
    const r = await page.evaluate(() => ({
      hash: window.location.hash,
      body: (document.body.innerText || '').slice(0, 150),
    }))
    const ok = r.hash.startsWith(`#${path}`) && !r.hash.startsWith('#/apps')
    console.log(`  ${path} → ${r.hash}${ok ? ' ✅' : ' ❌'}`)
    assert(ok, `${path} 应停留在独立能力页: ${JSON.stringify(r)}`)
  }

  // 3. /voice 父入口落在文本转语音
  await page.evaluate(() => { window.location.hash = '#/voice' })
  await page.waitForTimeout(900)
  const v = await page.evaluate(() => window.location.hash)
  console.log(`  /voice → ${v}${v.startsWith('#/voice/tts') ? ' ✅' : ' ❌'}`)
  assert(v.startsWith('#/voice/tts'), `/voice 应重定向到 /voice/tts，实际 ${v}`)

  console.log('\n===== 能力入口恢复（图像生成/文档翻译/语音助手）验证通过 ✅ =====')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
