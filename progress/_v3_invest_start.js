// 星宇 60s 验证运行（写作层=新闻调查技能，犀利质疑档 + 角度引导）
const { connect } = require('./_lib_cdp')
const fs = require('fs')

const DEF_ID = 'builtin_def_script-to-video-v3'
const ASSET_ID = fs.readFileSync('progress/_v3_60s_asset_id.txt', 'utf-8').trim()

const inputs = {
  scriptSource: 'asset',
  scriptText: '',
  topic: '',
  keyPoints: '',
  scriptAssetIds: [ASSET_ID],
  knowledgeBaseIds: [],
  videoType: 'financial-deep',
  videoStyle: '严肃财经纪实风，深蓝与鎏金主色调；演播室、车灯工厂产线、发布会、奖杯与文件等真实场景质感；构图干净庄重、信息层次分明；固定机位配合缓慢推近/横移运镜，庄重克制，无卡通、无夸张特效、画面无任何文字',
  visualStrategy: 'auto',
  writerSkill: 'auto',
  writerAttitude: '犀利质疑',
  writerAngle: '突出两个必须能指回素材的质疑：一是“最佳雇主十强+账上36亿现金”与“清退107名刚毕业的年轻人”的反差；二是“董事长三度致歉、否认订单断崖”与“股价腰斩、质疑反而更多”的对照。金句倾向：道歉是止损的姿态，奔驰大众的调查结论与订单走向才是真正的答案。',
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
  const r = await page.evaluate(`window.electronAPI.workflow.startRun(${JSON.stringify({ definitionId: DEF_ID, inputs })}).then(x => x)`)
  console.log('START:', JSON.stringify({ success: r && r.success, runId: r && r.data && r.data.id, status: r && r.data && r.data.status, error: (r && r.data && r.data.error) || (r && r.error) }))
  if (r && r.success && r.data && r.data.id) fs.writeFileSync('progress/_v3_60s_invest_run_id.txt', r.data.id, 'utf-8')
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
