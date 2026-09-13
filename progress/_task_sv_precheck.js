// 核查：script-to-video 定义（含 review1/vid1/边）、provider 配置与模型
const { chromium } = require('playwright-core')
const fs = require('fs')
const OUT = 'C:/Users/daoge/code/project/the-bot/progress/_task_sv_precheck.json'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const ev = (expr) => page.evaluate(expr)
  const out = {}

  const def = await ev(`window.electronAPI.workflow.getDefinition('builtin_def_script-to-video').then(x => (x.success ? x.data : { error: x.error }))`)
  const graph = def && (def.publishedGraph || def.draftGraph || def.graph)
  const nodes = graph ? graph.nodes || [] : []
  const edges = graph ? graph.edges || [] : []
  out.def = {
    id: def && def.id, name: def && def.name, templateVersion: def && def.templateVersion,
    nodeIds: nodes.map(n => n.id + ':' + n.type),
    edgeKinds: edges.map(e => e.sourceNodeId + '->' + e.targetNodeId + ':' + e.kind),
    startInputs: (nodes.find(n => n.id === 'start') || {}).config ? (nodes.find(n => n.id === 'start').config.inputs || []).map(i => i.key) : [],
    review1Editable: (nodes.find(n => n.id === 'review1') || { config: {} }).config.editableFields,
    vid1: (nodes.find(n => n.id === 'vid1') || { config: {} }).config,
    img1: (nodes.find(n => n.id === 'img1') || { config: {} }).config,
  }

  const cfgs = await ev(`window.electronAPI.providerConfig.list().then(x => (x.success ? x.data : { error: x.error }))`)
  out.providerConfigs = (cfgs || []).filter(c => ['comfyui', 'dashscope', 'aliyun'].includes(String(c.templateId).toLowerCase()) || ['pc_mtpifm8s_6673t2qzg', 'pc_mmxkxgpl_khcf6xrfp', 'pc_mmyf038f_3do48dnca'].includes(c.id)).map(c => ({
    id: c.id, name: c.name, templateId: c.templateId, imageBaseUrl: c.imageBaseUrl, videoBaseUrl: c.videoBaseUrl, requiresApiKey: c.requiresApiKey,
    models: (c.models || []).map(m => m.id + ':' + m.type),
  }))

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf-8')
  console.log('WROTE', OUT)
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
