// 启动 script-to-video 运行：星宇股份短视频脚本-2026-09-04（#0 300s完整版），ComfyUI 网关
const { chromium } = require('playwright-core')
const fs = require('fs')

const SCRIPT = fs.readFileSync('C:/Users/daoge/code/project/the-bot/progress/_sv_asset_0.md', 'utf-8')

const inputs = {
  script: SCRIPT,
  videoStyle: '严肃财经纪实风，深蓝与鎏金主色调；演播室、车灯工厂产线、发布会、奖杯与文件等真实场景质感；构图干净庄重、信息层次分明；固定机位配合缓慢推近/横移运镜，庄重克制，无卡通、无夸张特效、画面无任何文字',
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
  if (r.data?.id) fs.writeFileSync('C:/Users/daoge/code/project/the-bot/progress/_sv_run_id.txt', r.data.id, 'utf-8')
  fs.writeFileSync('C:/Users/daoge/code/project/the-bot/progress/_sv_start_inputs.json', JSON.stringify({ scriptLen: SCRIPT.length, ...inputs }, null, 2), 'utf-8')
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
