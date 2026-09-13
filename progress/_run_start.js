const { chromium } = require('playwright-core')
const fs = require('fs')
const SHORT_SCRIPT = fs.readFileSync('C:/Users/daoge/code/project/the-bot/progress/script_short_test.md', 'utf-8')

const inputs = {
  script: SHORT_SCRIPT,
  videoProviderConfigId: 'pc_mmyf038f_3do48dnca',
  videoModelId: 'ep-20260511121109-hchqf',
  imageProviderConfigId: 'pc_mmyf038f_3do48dnca',
  imageModelId: 'ep-20260329002741-4wjp7',
  voiceId: 'cosyvoice-v3.5-plus-vd-dsn-71398add049048a5b443da80d010b30d',
  voiceProviderConfigId: 'pc_mmxkxgpl_khcf6xrfp',
  width: 1080, height: 1920, bgmPath: '',
  model: { providerConfigId: 'pc_mmyf038f_3do48dnca', modelId: 'ep-20260225205702-vh6zc' },
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const r = await page.evaluate(({ defId, inputs }) => window.electronAPI.workflow.startRun({ definitionId: defId, inputs }), { defId: 'builtin_def_script-to-video', inputs })
  console.log(JSON.stringify({ success: r.success, runId: r.data?.id, status: r.data?.status, error: r.data?.error }, null, 2))
  fs.writeFileSync('C:/Users/daoge/code/project/the-bot/progress/_run_id.txt', r.data?.id || '')
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
