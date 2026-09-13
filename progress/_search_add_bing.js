// 新建免 Key 必应配置 → 测试 → 设默认（失败的候选依次尝试）
const { chromium } = require('playwright-core')

const CANDIDATES = [
  { templateId: 'bing-web', name: '必应（免Key）' },
  { templateId: 'baidu', name: '百度（免Key）' },
  { templateId: 'google-web', name: 'Google（免Key）' },
]

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')

  const list0 = await page.evaluate(() => window.electronAPI.searchEngine.list().then(x => x))
  const existing = list0?.data ?? []
  console.log('现有配置:', existing.map(c => `${c.name}(${c.templateId},default=${c.isDefault})`).join(' | ') || '无')

  let picked = null
  for (const cand of CANDIDATES) {
    let cfg = existing.find(c => c.templateId === cand.templateId)
    if (!cfg) {
      const created = await page.evaluate((d) => window.electronAPI.searchEngine.create(d).then(x => x).catch(e => ({ success: false, error: String(e) })), { templateId: cand.templateId, name: cand.name, isEnabled: true })
      console.log(`创建 ${cand.name}:`, JSON.stringify(created).slice(0, 200))
      cfg = created?.config ?? created?.data?.config ?? created?.data
    }
    if (!cfg?.id) continue
    const test = await page.evaluate(({ id }) => window.electronAPI.searchEngine.test({ configId: id, query: 'TikTok Shop 入驻条件' }).then(x => x).catch(e => ({ success: false, error: String(e) })), { id: cfg.id })
    console.log(`测试 ${cand.name}:`, JSON.stringify(test).slice(0, 220))
    const search = await page.evaluate(({ id, engine }) => window.electronAPI.searchEngine.search({ query: 'TikTok Shop 东南亚 入驻', engine, configId: id, maxResults: 5 }).then(x => x).catch(e => ({ success: false, error: String(e) })), { id: cfg.id, engine: cand.templateId })
    const rs = search?.data?.results ?? search?.results ?? []
    console.log(`搜索 ${cand.name}: success=${search?.success} count=${Array.isArray(rs) ? rs.length : 0} error=${search?.error ?? ''}`)
    if (search?.success && Array.isArray(rs) && rs.length > 0) { picked = cfg; break }
  }

  if (!picked) { console.log('三个免 Key 引擎都不可用——建议换有额度的引擎（博查/Tavily）'); await browser.close(); return }
  const set = await page.evaluate((id) => window.electronAPI.searchEngine.setDefault(id).then(x => x), picked.id)
  console.log('setDefault:', JSON.stringify(set))
  const list1 = await page.evaluate(() => window.electronAPI.searchEngine.list().then(x => x))
  for (const c of (list1?.data ?? [])) console.log(`- ${c.name} template=${c.templateId} enabled=${c.isEnabled} isDefault=${c.isDefault}`)
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
