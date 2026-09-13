// V3 M1 场景启动：imagery（意象素材板停） / gate（asset 缺素材被拦） / asset（素材驱动素材板停）
const { chromium } = require('playwright-core')
const fs = require('fs')
const SCENARIO = process.argv[2] || 'gate'
const ASSET_TXT = 'asset_1788523944352_tjb4e1jsi'
const IMG_A = 'asset_1788689018556_qwl87d96j'
const IMG_B = 'asset_1788688834937_wj2lh2j3h'
const SHORT_MD = '## 脚本概览\n\n- **主题**：链路验证单镜（5 秒）\n- **时长**：约 5 秒（竖版 9:16）\n\n## 完整口播文案\n\n这是一段用于验证视觉策略分流是否健康的测试内容。\n\n## 分镜表\n\n| 镜头 | 画面 | 口播 | 字幕 | 时长(秒) |\n|---|---|---|---|---|\n| 1 | 特写景别，金色奖杯置于展示台，聚光灯下泛温润光泽，缓慢推近 | 这是一段用于验证视觉策略分流是否健康的测试内容。 | 视觉策略链路验证 | 5 |'

const base = {
  scriptSource: 'text',
  scriptText: SHORT_MD,
  topic: '',
  keyPoints: '',
  scriptAssetIds: [],
  knowledgeBaseIds: [],
  videoType: 'financial-deep',
  videoStyle: '',
  visualStrategy: 'auto',
  referenceAssetIds: [],
  baseImageAssetIds: [],
  width: 704, height: 1248,
  voiceId: 'cosyvoice-v3.5-plus-vd-dsn-71398add049048a5b443da80d010b30d',
  voiceProviderConfigId: 'pc_mmxkxgpl_khcf6xrfp',
  videoProviderConfigId: 'pc_mtpifm8s_6673t2qzg',
  videoModelId: 'h3',
  videoQuality: 'low',
  h3Steps: 4,
  imageProviderConfigId: 'pc_mtpifm8s_6673t2qzg',
  imageModelId: 'krea2',
  bgmPath: '',
  model: { providerConfigId: 'pc_mmyf038f_3do48dnca', modelId: 'ep-20260225205702-vh6zc' },
}

const inputs = JSON.parse(JSON.stringify(base))
if (SCENARIO === 'imagery') {
  inputs.videoType = 'financial-deep'
  inputs.visualStrategy = 'imagery'
} else if (SCENARIO === 'asset') {
  inputs.videoType = 'brand'
  inputs.visualStrategy = 'asset'
  inputs.baseImageAssetIds = [IMG_A, IMG_B]
} else { // gate
  inputs.videoType = 'ecommerce'
  inputs.visualStrategy = 'asset'
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const r = await page.evaluate(
    `window.electronAPI.workflow.startRun(${JSON.stringify({ definitionId: 'builtin_def_script-to-video-v3', inputs })}).then(x => x)`
  )
  console.log('SCENARIO=' + SCENARIO, 'START:', JSON.stringify({ success: r.success, runId: r.data && r.data.id, status: r.data && r.data.status, error: r.data && r.data.error }))
  if (r.data && r.data.id) fs.writeFileSync('C:/Users/daoge/code/project/the-bot/progress/_v3_m1_run_id.txt', SCENARIO + '\n' + r.data.id, 'utf-8')
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
