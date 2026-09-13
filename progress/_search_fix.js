// 修搜索默认：查看被禁用的免 Key 引擎，并把已启用的配置设为默认
const { chromium } = require('playwright-core')
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')

  const disabled = await page.evaluate(() => window.electronAPI.searchEngine.getDisabledQuickEngines().then(x => x))
  console.log('被禁用的免 Key 引擎:', JSON.stringify(disabled?.data ?? disabled))

  const list0 = await page.evaluate(() => window.electronAPI.searchEngine.list().then(x => x))
  const zhipu = (list0?.data ?? []).find(c => c.templateId === 'zhipu')
  if (!zhipu) { console.log('未找到智谱配置'); await browser.close(); return }

  // 先测一下智谱能否真的搜到（会真实调用一次 API）
  const test = await page.evaluate((id) => window.electronAPI.searchEngine.test({ id, query: 'TikTok Shop 入驻 条件' }).then(x => x).catch(e => ({ success: false, error: String(e) })), zhipu.id)
  console.log('智谱测试:', JSON.stringify({ success: test?.success, error: test?.error, count: test?.data?.length ?? test?.data?.results?.length }))

  const set = await page.evaluate((id) => window.electronAPI.searchEngine.setDefault(id).then(x => x), zhipu.id)
  console.log('setDefault:', JSON.stringify(set))

  const list1 = await page.evaluate(() => window.electronAPI.searchEngine.list().then(x => x))
  for (const c of (list1?.data ?? [])) console.log(`- ${c.name} template=${c.templateId} enabled=${c.isEnabled} isDefault=${c.isDefault}`)
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
