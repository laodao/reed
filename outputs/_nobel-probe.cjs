// 探测 dev 实例：内置应用在位？供应商/模型可用？
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')
  const env = await page.evaluate(async () => {
    const app = await window.electronAPI.app.get('builtin_app_topic_research')
    const app2 = await window.electronAPI.app.get('builtin_app_long_form_writing')
    const pc = await window.electronAPI.providerConfig.list()
    const cfgs = (pc.data ?? []).map(c => ({ id: c.id, name: c.name, enabled: c.enabled, models: (c.models ?? []).slice(0, 12).map(m => ({ id: m.id, name: m.name, type: m.type, enabled: m.enabled !== false })) }))
    return { topic: app?.success, longform: app2?.success, cfgs }
  })
  console.log(JSON.stringify(env, null, 1))
})().catch(e => { console.error('probe 失败：', e.message); process.exit(1) })
