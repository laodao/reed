/**
 * E2E 真实业务测试 #7：设置面读写
 * 覆盖：settings:get 全量/单键、theme 改写再改回（可回写项验证）、
 *       data-path:get-config、searchEngine 模板+配置列表、providerTemplate 列表、pack.list
 * 输出 SETTINGS_RESULT=...
 */
const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')
  const results = []
  const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(ok ? '✅' : '❌', name, detail || '') }

  // 1. settings:get 全量
  const all = await page.evaluate(() => window.electronAPI.settings.get())
  check('settings.get 全量', all.success && all.data && typeof all.data === 'object', `键数=${all.data ? Object.keys(all.data).length : 0}`)

  // 2. theme 读 → 改 → 读回 → 改回
  const t0 = await page.evaluate(() => window.electronAPI.settings.get('theme'))
  const origTheme = t0.success ? t0.data : null
  const tmpTheme = origTheme === 'e2e-tmp-theme' ? 'e2e-tmp-theme-2' : 'e2e-tmp-theme'
  const set1 = await page.evaluate((v) => window.electronAPI.settings.set('theme', v), tmpTheme)
  const t1 = await page.evaluate(() => window.electronAPI.settings.get('theme'))
  const restored = await page.evaluate((v) => window.electronAPI.settings.set('theme', v), origTheme)
  const t2 = await page.evaluate(() => window.electronAPI.settings.get('theme'))
  check('theme 改写→读回→还原', set1.success && t1.data === tmpTheme && restored.success && t2.data === origTheme,
    `原值=${JSON.stringify(origTheme)} 改后=${JSON.stringify(t1.data)} 还原=${JSON.stringify(t2.data)}`)

  // 3. 自定义键写入/删除语义（写一个 E2E 键再读回，最后清掉）
  await page.evaluate(() => window.electronAPI.settings.set('e2e_real_probe', { ts: Date.now() }))
  const probe = await page.evaluate(() => window.electronAPI.settings.get('e2e_real_probe'))
  check('自定义键读写', probe.success && probe.data && typeof probe.data.ts === 'number', JSON.stringify(probe.data))
  await page.evaluate(() => window.electronAPI.settings.set('e2e_real_probe', null))

  // 4. 数据路径查询
  const dp = await page.evaluate(() => window.electronAPI.dataPath.getConfig())
  check('data-path:get-config', dp.success && !!(dp.data && (dp.data.currentPath || dp.data.dataPath || dp.data.path)), JSON.stringify(dp.data).slice(0, 150))

  // 5. 搜索引擎模板 + 配置列表（响应结构为 {success, templates} / {success, configs}）
  const seT = await page.evaluate(() => window.electronAPI.searchEngine.getTemplates())
  const seL = await page.evaluate(() => window.electronAPI.searchEngine.list())
  const seTemplates = seT.templates ?? seT.data
  const seConfigs = seL.configs ?? seL.data
  check('searchEngine 模板/配置列表', seT.success && seL.success && Array.isArray(seTemplates),
    `模板=${seTemplates?.length ?? '-'} 配置=${seConfigs?.length ?? '-'}`)

  // 6. provider 模板列表（响应结构 {success, templates}）
  const pt = await page.evaluate(() => window.electronAPI.providerTemplate.list())
  const pTemplates = pt.templates ?? pt.data
  check('providerTemplate.list', pt.success && Array.isArray(pTemplates) && pTemplates.length > 0, `模板数=${pTemplates?.length ?? '-'}`)

  // 7. pack.list
  const pk = await page.evaluate(() => window.electronAPI.pack.list())
  check('pack.list', pk.success && pk.data.length === 7, `包数=${pk.data?.length ?? '-'}`)

  const allOk = results.every(r => r.ok)
  console.log(allOk ? '\n✅ 设置面全部通过' : '\n❌ 存在失败项')
  console.log('SETTINGS_RESULT=' + JSON.stringify({ ok: allOk, items: results.map(r => ({ name: r.name, ok: r.ok })) }))
  await browser.close()
  if (!allOk) process.exit(1)
})().catch(e => { console.error('脚本失败:', e.message); process.exit(1) })
