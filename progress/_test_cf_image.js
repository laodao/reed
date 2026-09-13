const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')

  const r = await page.evaluate(() => window.electronAPI.image.generate({
    providerConfigId: 'pc_mtpifm8s_6673t2qzg',
    model: 'krea2',
    prompt: 'A golden award trophy on a dark stage podium, warm spotlight, cinematic, clean composition, no text',
    width: 768,
    height: 1024,
    skipHistory: true,
  }))
  console.log(JSON.stringify({ success: r?.success, taskId: r?.data?.taskId, error: r?.error }, null, 2))
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })