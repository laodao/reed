/** 探针：检查运行中应用的 provider 配置 / 图像 provider / 语音 provider 可用性 */
const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')
  const r = await page.evaluate(async () => {
    const out = {}
    const safe = async (k, fn) => { try { out[k] = await fn() } catch (e) { out[k] = { __throw: String(e) } } }
    await safe('providerConfigs', async () => {
      const r = await window.electronAPI.providerConfig.list()
      const list = r.configs || r.data || r
      return Array.isArray(list)
        ? list.map(c => ({ id: c.id, name: c.name, isEnabled: c.isEnabled, isDefault: c.isDefault, hasKey: !!c.apiKey, defaultModelId: c.defaultModelId, models: (c.models || []).map(m => m.id) }))
        : r
    })
    await safe('imageProviders', async () => {
      const r = await window.electronAPI.image.getProviders()
      const list = r.providers || r.data || r
      return Array.isArray(list) ? list.map(p => ({ id: p.id, name: p.name, enabled: p.enabled ?? p.isEnabled, hasKey: !!p.apiKey, configured: p.configured })) : r
    })
    await safe('voiceProviders', () => window.electronAPI.voice.getProviders())
    await safe('packs', async () => (await window.electronAPI.pack.list()).data.map(p => ({ id: p.id, enabled: p.enabled, state: p.state })))
    return out
  })
  console.log(JSON.stringify(r, null, 2))
  await browser.close()
})().catch(e => { console.error('probe 失败:', e.message); process.exit(1) })
