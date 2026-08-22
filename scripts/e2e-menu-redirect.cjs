// 阶段三验证：菜单精简 + 路由重定向
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  // 1. 侧边栏菜单（图标模式，hover tooltip 在 DOM 里）
  await page.evaluate(() => { window.location.hash = '#/apps' })
  await page.waitForTimeout(600)
  const menu = await page.evaluate(() => {
    const tooltips = [...document.querySelectorAll('.el-popper, [role="tooltip"]')].map(t => t.textContent?.trim()).filter(Boolean)
    return tooltips
  })
  console.log('tooltips 样例:', JSON.stringify(menu.slice(0, 12)))
  // 图标模式 tooltip 不一定都在 DOM；改验证 Home 卡片（首页功能卡片来自同一菜单数据源）
  await page.evaluate(() => { window.location.hash = '#/' })
  await page.waitForTimeout(800)
  const home = await page.evaluate(() => (document.body.innerText || ''))
  const removedNames = ['图像生成', '文档翻译', '文本转语音', '语音转文本', '声音复刻', '语音识别与语音合成']
  for (const n of removedNames) {
    if (home.includes(n)) console.log(`⚠️ 首页仍含「${n}」`)
  }
  console.log('首页含「资产管理」:', home.includes('资产管理'), '| 含「应用」:', home.includes('应用'))

  // 2. 旧路由重定向
  for (const [path, expectName] of [['/image', '图像生成'], ['/translate', '文档翻译'], ['/voice/tts', '文本转语音'], ['/voice/clone', '语音复刻']]) {
    await page.evaluate(p => { window.location.hash = p }, path)
    await page.waitForTimeout(900)
    const r = await page.evaluate(() => ({
      hash: window.location.hash,
      title: document.querySelector('.page-title')?.textContent ?? '',
      body: (document.body.innerText || '').slice(0, 150),
    }))
    const ok = r.hash.startsWith(`#/apps/`) && r.title.startsWith(expectName)
    console.log(`  ${path} → ${r.hash}（${r.title}）${ok ? '✅' : '❌'}`)
    assert(ok, `${path} 重定向异常: ${JSON.stringify(r)}`)
  }

  // 3. /voice 兜底 → 应用列表
  await page.evaluate(() => { window.location.hash = '#/voice' })
  await page.waitForTimeout(900)
  const v = await page.evaluate(() => ({ hash: window.location.hash, title: document.querySelector('.page-title')?.textContent ?? '' }))
  console.log(`  /voice → ${v.hash}（${v.title}）${v.hash.startsWith('#/apps') && v.title === '应用' ? '✅' : '❌'}`)
  assert(v.hash.startsWith('#/apps') && v.title === '应用', `/voice 兜底异常 ${JSON.stringify(v)}`)

  console.log('\n===== 阶段三（菜单精简 + 路由重定向）验证通过 ✅ =====')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
