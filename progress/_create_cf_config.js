const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')

  // 先查是否已存在 comfyui 配置
  const existing = await page.evaluate(() => window.electronAPI.providerConfig.list())
  const dup = (existing?.data || []).find(c => c.templateId === 'comfyui')
  if (dup) {
    console.log('ALREADY EXISTS:', dup.id, dup.name)
    await browser.close()
    return
  }

  const r = await page.evaluate(() => window.electronAPI.providerConfig.create({
    templateId: 'comfyui',
    name: 'ComfyUI 生成网关（本地）',
    shortId: 'comfyui',
    imageBaseUrl: 'http://192.168.2.128:8190',
    videoBaseUrl: 'http://192.168.2.128:8190',
    models: [
      { id: 'krea2', name: 'Krea2 文生图', type: 'image', contextWindow: 0, maxOutputTokens: 0, features: ['image'] },
      { id: 'flux-kontext', name: 'Flux Kontext 参考图生图', type: 'image', contextWindow: 0, maxOutputTokens: 0, features: ['image'] },
      { id: 'h3', name: 'MiniMax-H3 图生视频（自带配音）', type: 'video', contextWindow: 0, maxOutputTokens: 0, features: ['video'] },
    ],
    isEnabled: true,
  }))
  console.log(JSON.stringify({ success: r?.success, id: r?.config?.id, error: r?.error }, null, 2))
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })