const { chromium } = require('playwright-core')
const fs = require('fs')
const SMOKE_SCRIPT = fs.readFileSync('C:/Users/daoge/code/project/the-bot/progress/script_smoke_test.md', 'utf-8')

const inputs = {
  script: SMOKE_SCRIPT,
  videoProviderConfigId: 'pc_mmyf038f_3do48dnca',
  videoModelId: 'ep-20260511121109-hchqf',
  imageProviderConfigId: 'pc_mmyf038f_3do48dnca',
  imageModelId: 'ep-20260329002741-4wjp7',
  voiceId: 'cosyvoice-v3.5-plus-vd-dsn-71398add049048a5b443da80d010b30d',
  voiceProviderConfigId: 'pc_mmxkxgpl_khcf6xrfp',
  // 低分辨率 480p 竖版：inferResolution 按 maxSide 判断（≥1000→1080p; ≥600→720p; 否则 480p）
  // 480p 档需 maxSide < 600：选 360x640 → maxSide=640 ≥600 仍是 720p！故选 320x568 → maxSide=568 → 480p
  width: 320, height: 568,
  bgmPath: '',
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