const { chromium } = require('playwright-core')
const fs = require('fs')
const SMOKE_SCRIPT = fs.readFileSync('C:/Users/daoge/code/project/the-bot/progress/script_smoke_test.md', 'utf-8')

const inputs = {
  script: SMOKE_SCRIPT,
  videoStyle: '纪实资讯风：写实、干净、画面信息层次清晰；固定镜头或缓慢推近，庄重不花哨',
  styleReferenceImage: '',
  // ComfyUI 生成网关（本地免费）
  videoProviderConfigId: 'pc_mtpifm8s_6673t2qzg',
  videoModelId: 'h3',
  imageProviderConfigId: 'pc_mtpifm8s_6673t2qzg',
  imageModelId: 'krea2',
  voiceId: 'cosyvoice-v3.5-plus-vd-dsn-71398add049048a5b443da80d010b30d',
  voiceProviderConfigId: 'pc_mmxkxgpl_khcf6xrfp',
  width: 704, height: 1248,
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