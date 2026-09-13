// 用正确参数测智谱；失败则创建免 Key 必应配置并设为默认
const { chromium } = require('playwright-core')
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')

  const list0 = await page.evaluate(() => window.electronAPI.searchEngine.list().then(x => x))
  const zhipu = (list0?.data ?? []).find(c => c.templateId === 'zhipu')
  console.log('智谱配置:', zhipu ? `${zhipu.id} default=${zhipu.isDefault}` : '无')

  if (zhipu) {
    const test = await page.evaluate((id) => window.electronAPI.searchEngine.test({ configId: id, query: 'TikTok Shop 入驻条件' }).then(x => x).catch(e => ({ success: false, error: String(e) })), zhipu.id)
    console.log('智谱 testConfig:', JSON.stringify(test).slice(0, 400))
    const search = await page.evaluate((id) => window.electronAPI.searchEngine.search({ query: 'TikTok Shop 入驻条件', configId: id, maxResults: 5 }).then(x => x).catch(e => ({ success: false, error: String(e) })), zhipu.id)
    const rs = search?.data?.results ?? search?.data ?? []
    console.log('智谱 search:', JSON.stringify({ success: search?.success, error: search?.error, count: Array.isArray(rs) ? rs.length : 0 }))
  }

  // 再建一个免 Key 的必应配置作为兜底（若已存在则跳过）
  const hasBing = (list0?.data ?? []).some(c => c.templateId === 'bing-web')
  let bingId = null
  if (!hasBing) {
    const created = await page.evaluate(() => window.electronAPI.searchEngine.create({ templateId: 'bing-web', name: '必应（免Key兜底）', isEnabled: true }).then(x => x).catch(e => ({ success: false, error: String(e) })))
    console.log('创建必应:', JSON.stringify(created).slice(0, 300))
    bingId = created?.data?.id ?? null
  } else {
    bingId = (list0?.data ?? []).find(c => c.templateId === 'bing-web')?.id ?? null
  }
  if (bingId) {
    const test = await page.evaluate((id) => window.electronAPI.searchEngine.test({ configId: id, query: 'TikTok Shop 入驻条件' }).then(x => x).catch(e => ({ success: false, error: String(e) })), bingId)
    console.log('必应 testConfig:', JSON.stringify(test).slice(0, 300))
  }

  const list1 = await page.evaluate(() => window.electronAPI.searchEngine.list().then(x => x))
  for (const c of (list1?.data ?? [])) console.log(`- ${c.name} template=${c.templateId} enabled=${c.isEnabled} isDefault=${c.isDefault}`)
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
