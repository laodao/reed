const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const r = await page.evaluate(() => window.electronAPI.voice.tts({
    text: '今年1月，一家A股上市公司刚刚捧回常州最佳雇主10强的奖杯。',
    voiceId: 'cosyvoice-v3.5-plus-vd-dsn-71398add049048a5b443da80d010b30d',
    providerId: 'pc_mmxkxgpl_khcf6xrfp',
  }))
  console.log(JSON.stringify(r, null, 2).slice(0, 2000))
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
