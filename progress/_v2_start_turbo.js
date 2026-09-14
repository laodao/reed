// 评审 #105 真机回归：5s 单镜 + turbo 档（videoQuality=low / h3Steps=4）
const { chromium } = require('playwright-core')
const fs = require('fs')

const SCRIPT = fs.readFileSync('C:/Users/daoge/code/project/the-bot/progress/_v2_single_shot.md', 'utf-8')

const inputs = {
  scriptSource: 'text',
  scriptText: SCRIPT,
  topic: '',
  keyPoints: '',
  scriptAssetIds: [],
  knowledgeBaseIds: [],
  videoType: 'financial-deep',
  videoStyle: '',
  referenceAssetIds: [],
  baseImageAssetIds: [],
  width: 704, height: 1248,
  // 评审 #105：turbo 档（真机提速验证）
  videoQuality: 'low',
  h3Steps: 4,
  voiceId: 'cosyvoice-v3.5-plus-vd-dsn-71398add049048a5b443da80d010b30d',
  voiceProviderConfigId: 'pc_mmxkxgpl_khcf6xrfp',
  videoProviderConfigId: 'pc_mtpifm8s_6673t2qzg',
  videoModelId: 'h3',
  imageProviderConfigId: 'pc_mtpifm8s_6673t2qzg',
  imageModelId: 'krea2',
  bgmPath: '',
  model: { providerConfigId: 'pc_mmyf038f_3do48dnca', modelId: 'ep-20260225205702-vh6zc' },
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const def = await page.evaluate(() => window.electronAPI.workflow.getDefinition('builtin_def_script-to-video-v2').then(x => (x.success ? x.data : null)))
  const startInputs = (def && def.publishedGraph && def.publishedGraph.nodes.find((n) => n.id === 'start')?.config?.inputs) || []
  const keys = startInputs.map(i => i.key).join(', ')
  console.log('DEF inputs count:', startInputs.length, '| has videoQuality:', startInputs.some(i => i.key === 'videoQuality'), '| has h3Steps:', startInputs.some(i => i.key === 'h3Steps'))
  console.log('KEYS:', keys)
  const r = await page.evaluate(({ defId, inputs }) => window.electronAPI.workflow.startRun({ definitionId: defId, inputs }), { defId: 'builtin_def_script-to-video-v2', inputs })
  console.log('START:', JSON.stringify({ success: r.success, runId: r.data?.id, status: r.data?.status, error: r.data?.error }))
  if (r.data?.id) fs.writeFileSync('C:/Users/daoge/code/project/the-bot/progress/_v2_turbo_run_id.txt', r.data.id, 'utf-8')
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
