// 创建 60s 口播文案资产（源自吃瓜报告改写）→ 启动 V3 运行（financial-deep / auto→imagery / turbo low）
const { connect } = require('./_lib_cdp')
const fs = require('fs')

const SCRIPT_MD = fs.readFileSync('progress/_v3_60s_script_asset.md', 'utf8')
const DEF_ID = 'builtin_def_script-to-video-v3'

const inputs = {
  scriptSource: 'asset',
  scriptText: '',
  topic: '',
  keyPoints: '',
  scriptAssetIds: [],
  knowledgeBaseIds: [],
  videoType: 'financial-deep',
  videoStyle: '严肃财经纪实风，深蓝与鎏金主色调；演播室、车灯工厂产线、发布会、奖杯与文件等真实场景质感；构图干净庄重、信息层次分明；固定机位配合缓慢推近/横移运镜，庄重克制，无卡通、无夸张特效、画面无任何文字',
  visualStrategy: 'auto',
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
  const { browser, page } = await connect()
  // 1) 创建文本资产
  const createPayload = {
    category: 'text',
    name: '星宇股份短视频脚本-60s-2026-09-04-V3（吃瓜报告改写）',
    description: '由《星宇股份吃瓜报告-2026-09-04》压缩改写为约60秒口播文案；V3 imagery 意象化空镜验证用',
    tags: ['星宇股份', '60s', 'V3', 'imagery'],
    content: { kind: 'text', text: SCRIPT_MD },
    sourceType: 'manual',
  }
  const created = await page.evaluate(`window.electronAPI.assets.create(${JSON.stringify(createPayload)}).then(x => x)`)
  if (!created || !created.success) throw new Error('asset create 失败: ' + JSON.stringify(created))
  const assetId = created.data.id || created.data.assetId || JSON.stringify(created.data)
  console.log('ASSET:', assetId)
  fs.writeFileSync('progress/_v3_60s_asset_id.txt', String(assetId), 'utf-8')
  inputs.scriptAssetIds = [String(assetId)]

  // 2) 取定义 start 入参键核对
  const def = await page.evaluate(`window.electronAPI.workflow.getDefinition(${JSON.stringify(DEF_ID)}).then(x => (x.success ? x.data : null))`)
  const start = def && (def.publishedGraph || def.graph || def) && ((def.publishedGraph || def.graph || {}).nodes || []).find(n => n.id === 'start')
  const keys = (start && start.config && start.config.inputs || []).map(i => i.key)
  console.log('START KEYS:', keys.join(', '))
  const missing = Object.keys(inputs).filter(k => !keys.includes(k))
  if (missing.length) console.log('⚠ 输入键不在 start 定义中:', missing.join(', '))

  // 3) 启动运行
  const r = await page.evaluate(`window.electronAPI.workflow.startRun(${JSON.stringify({ definitionId: DEF_ID, inputs })}).then(x => x)`)
  console.log('START:', JSON.stringify({ success: r && r.success, runId: r && r.data && r.data.id, status: r && r.data && r.data.status, error: r && r.data && r.data.error || (r && r.error) }))
  if (r && r.success && r.data && r.data.id) fs.writeFileSync('progress/_v3_60s_run_id.txt', r.data.id, 'utf-8')
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
