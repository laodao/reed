// P0：最小真机验证「动态选技能」—— skill-call 的 skillId 用 {{code 节点输出}} 模板，跑两个视频类型应调用不同技能
const { connect } = require('./_lib_cdp')
const fs = require('fs')

const DEF_NAME = '__P0_dyn_skill_probe__'
const LLM_PROVIDER = 'pc_mmyf038f_3do48dnca'
const LLM_MODEL = 'ep-20260225205702-vh6zc'
const LOG = 'C:/Users/daoge/code/project/the-bot/progress/_p0_skill_probe.log'
function log(m) { const l = '[' + new Date().toLocaleTimeString() + '] ' + m; console.log(l); fs.appendFileSync(LOG, l + '\n', 'utf-8') }

function buildGraph() {
  const pos = (i) => ({ x: 100 + i * 60, y: 100 + (i % 2) * 120 })
  const nodes = [
    { id: 'start', type: 'start', name: '开始', position: pos(0), config: { inputs: [
      { key: 'videoType', label: '视频类型', type: 'select', required: true, defaultValue: 'financial-deep', options: [
        { label: '财经深度', value: 'financial-deep' }, { label: '知识科普', value: 'knowledge' } ] },
      { key: 'material', label: '素材', type: 'textarea', required: false, defaultValue: '' },
      { key: 'topic', label: '主题', type: 'string', required: false, defaultValue: '' },
    ] } },
    { id: 'pickSkill', type: 'code', name: '按类型选技能', position: pos(1), config: {
      inputs: [{ key: 'videoType', value: '{{start.videoType}}' }],
      code: "const t = String(inputs.videoType || 'financial-deep');\nif (t === 'knowledge') return { skillId: 'deep-analysis' };\nreturn { skillId: 'short-video-script' };",
    } },
    { id: 'call', type: 'skill-call', name: '技能调用', position: pos(2), config: {
      skillId: '{{pickSkill.result.skillId}}',
      providerConfigId: LLM_PROVIDER,
      modelId: LLM_MODEL,
      inputs: [
        { key: 'material', value: '{{start.material}}' },
        { key: 'topic', value: '{{start.topic}}' },
        { key: 'duration', value: '60' },
      ],
    } },
    { id: 'end', type: 'end', name: '结束', position: pos(3), config: {} },
  ]
  const edges = [
    { id: 'e1', sourceNodeId: 'start', targetNodeId: 'pickSkill', kind: 'normal' },
    { id: 'e2', sourceNodeId: 'pickSkill', targetNodeId: 'call', kind: 'normal' },
    { id: 'e3', sourceNodeId: 'call', targetNodeId: 'end', kind: 'normal' },
  ]
  return { version: 1, nodes, edges }
}

async function waitTerminal(page, runId, timeoutMs = 240000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const d = await page.evaluate(`window.electronAPI.workflow.getRun(${JSON.stringify(runId)}).then(x => (x.success ? x.data : null))`)
    const st = d && d.run && d.run.status
    if (['succeeded', 'failed', 'cancelled', 'timed_out', 'interrupted'].includes(st)) {
      const call = ((d && d.nodeRuns) || []).find(n => n.nodeId === 'call')
      return { status: st, callStatus: call && call.status, skillId: call && call.output && call.output.skillId, contentLen: ((call && call.output && call.output.content) || '').length, err: (call && call.error) || (d && d.run && d.run.error) }
    }
    await new Promise(r => setTimeout(r, 3000))
  }
  return { status: 'watch-timeout' }
}

async function main() {
  const { browser, page } = await connect()
  const ev = (expr) => page.evaluate(expr)
  const graph = buildGraph()

  const val = await ev(`window.electronAPI.workflow.validateGraph(${JSON.stringify(graph)}).then(x => x)`)
  log('validateGraph: ' + JSON.stringify(val && val.data ? { valid: val.data.valid, errors: (val.data.errors || []).slice(0, 10), warnings: (val.data.warnings || []).slice(0, 5) } : val))
  if (!val || !val.success || !val.data || !val.data.valid) { await browser.close(); return }

  const created = await ev(`window.electronAPI.workflow.createDefinition(${JSON.stringify({ name: DEF_NAME, description: 'P0 动态选技能临时验证（跑完即删）' })}).then(x => x)`)
  const defId = created && created.success && created.data && created.data.id
  log('created def: ' + defId + (created && created.error ? ' ERR=' + created.error : ''))
  if (!defId) { await browser.close(); return }
  try {
    const sd = await ev(`window.electronAPI.workflow.saveDraft(${JSON.stringify(defId)}, ${JSON.stringify(graph)}).then(x => x)`)
    log('saveDraft: ' + JSON.stringify(sd && { success: sd.success, error: sd.error }))
    const pub = await ev(`window.electronAPI.workflow.publishDefinition(${JSON.stringify({ id: defId })}).then(x => x)`)
    log('publish: ' + JSON.stringify(pub && { success: pub.success, error: pub.error }))

    const cases = [
      { tag: 'financial-deep→short-video-script', videoType: 'financial-deep', material: '某车灯龙头2026年7月招聘440名应届生，一个月后107人被要求主动离职或转岗产线，官方通报沟通简单生硬、人力总监停职，奔驰回函认定严重道德与劳动失当，大众启动调查，董事长三度致歉否认订单断崖，股价腰斩。', topic: '', expect: 'short-video-script' },
      { tag: 'knowledge→deep-analysis', videoType: 'knowledge', material: '光的折射：光从一种介质斜射入另一种介质时传播方向发生偏折。折射定律、全反射、光纤通信原理，生活例子：筷子入水变弯、海市蜃楼。', topic: '光的折射为何让筷子变弯？', expect: 'deep-analysis' },
    ]
    for (const c of cases) {
      const r = await ev(`window.electronAPI.workflow.startRun(${JSON.stringify({ definitionId: defId, inputs: { videoType: c.videoType, material: c.material, topic: c.topic } })}).then(x => x)`)
      const runId = r && r.success && r.data && r.data.id
      log('start [' + c.tag + '] runId=' + runId + ' err=' + JSON.stringify(r && (r.error || (r.data && r.data.error))))
      if (!runId) continue
      const res = await waitTerminal(page, runId)
      const ok = res.status === 'succeeded' && res.callStatus === 'succeeded' && res.skillId === c.expect
      log('RESULT [' + c.tag + '] ' + JSON.stringify(res) + ' ⇒ ' + (ok ? '✅ 符合预期' : '❌ 不符合预期'))
      await ev(`window.electronAPI.workflow.deleteRun(${JSON.stringify({ runId })}).then(x => x)`)
    }
  } finally {
    const del = await ev(`window.electronAPI.workflow.deleteDefinition(${JSON.stringify({ id: defId })}).then(x => x)`)
    log('cleanup deleteDefinition: ' + JSON.stringify(del && { success: del.success, error: del.error }))
    await browser.close()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
