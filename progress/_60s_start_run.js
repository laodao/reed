// 60 秒测试：引用资产「星宇股份短视频脚本-2026-09-04」（asset tjb4e1jsi·二选一·口径标注）
// turbo 低画质（videoQuality=low / h3Steps=4），ComfyUI（图 krea2 + 视频 h3）
const { chromium } = require('playwright-core')
const fs = require('fs')

const ASSET_ID = 'asset_1788523944352_tjb4e1jsi'
const inputs = {
  scriptSource: 'asset',
  scriptText: '',
  topic: '',
  keyPoints: '',
  scriptAssetIds: [ASSET_ID],
  knowledgeBaseIds: [],
  videoType: 'financial-deep',
  videoStyle: '严肃财经纪实风，深蓝与鎏金主色调；演播室、车灯工厂产线、发布会、奖杯与文件等真实场景质感；构图干净庄重、信息层次分明；固定机位配合缓慢推近/横移运镜，庄重克制，无卡通、无夸张特效、画面无任何文字',
  referenceAssetIds: [],
  baseImageAssetIds: [],
  width: 704, height: 1248,
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
  console.log('DEF inputs:', startInputs.length)
  const r = await page.evaluate(({ defId, inputs }) => window.electronAPI.workflow.startRun({ definitionId: defId, inputs }), { defId: 'builtin_def_script-to-video-v2', inputs })
  console.log('START:', JSON.stringify({ success: r.success, runId: r.data?.id, status: r.data?.status, error: r.data?.error }))
  if (r.data?.id) fs.writeFileSync('C:/Users/daoge/code/project/the-bot/progress/_60s_run_id.txt', r.data.id, 'utf-8')
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
