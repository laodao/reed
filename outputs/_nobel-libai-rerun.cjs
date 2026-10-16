/** 单独重跑 libai 阶段：临时应用 + maxTokens 32768；结果写 outputs/_nobel-libai-output.md */
const fs = require('fs')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)
const source = fs.readFileSync('outputs/_nobel-ws-draft.md', 'utf-8')
const GRAPH = JSON.parse(fs.readFileSync('outputs/_nobel-libai-only-graph.json', 'utf-8'))
const NAME = '预检-libai重跑-' + Date.now().toString(36)
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('renderer'))
  assert(page, '未找到渲染页')
  const ids = await page.evaluate(async (args) => {
    const wf = window.electronAPI.workflow
    const created = await wf.createDefinition({ name: args.name })
    if (!created.success) return { error: created.error }
    await wf.saveDraft(created.data.id, args.graph)
    const pub = await wf.publishDefinition({ id: created.data.id })
    if (!pub.success) return { error: pub.error }
    const app = await window.electronAPI.app.createFromWorkflow({ definitionId: created.data.id, name: args.name, channelSession: true, channelShare: false, channelApi: false })
    return app.success ? { defId: created.data.id, appId: app.data.id } : { error: app.error }
  }, { name: NAME, graph: GRAPH })
  assert(ids.appId, `建应用失败 ${JSON.stringify(ids)}`)
  const s = await page.evaluate(async (args) => {
    const c = await window.electronAPI.appSession.create({ appId: args.appId })
    if (!c.success) return { error: c.error }
    const st = await window.electronAPI.appSession.start({
      sessionId: c.data.id,
      inputs: { source_text: args.source, keep: '直接引语一字不动；数字、日期与口径标注不得改；三位获奖人姓名与机构不得写错', model: { providerConfigId: 'pc_mmyd3u5b_hkf5odex3', modelId: 'deepseek-v4-pro' } },
    })
    return st.success !== false ? { sid: c.data.id } : { error: st.error }
  }, { appId: ids.appId, source })
  assert(s.sid, `启动失败 ${JSON.stringify(s)}`)
  log(`libai 重跑会话 ${s.sid}`)
  fs.writeFileSync('outputs/_nobel-libaionly-meta.json', JSON.stringify({ ...ids, sid: s.sid }), 'utf-8')
  // 轮询 DB 直到 libai 节点出结果（避免 CDP 排队）
  const { execSync } = require('child_process')
  for (let i = 0; i < 60; i++) {
    await sleep(15000)
    try {
      const out = execSync(`python -c "
import sqlite3, json
con = sqlite3.connect('file:C:/Users/daoge/the-bot/the_bot.db?mode=ro', uri=True)
r = con.execute(\\"SELECT status, output_json, error FROM workflow_node_runs WHERE run_id=(SELECT last_run_id FROM app_sessions WHERE id='${s.sid}') AND node_id='libai' ORDER BY rowid DESC LIMIT 1\\").fetchone()
print(r[0], len(json.loads(r[1]).get('content','')) if r[1] else -1)
"`).toString().trim()
      log(`DB 轮询: ${out}`)
      if (out.startsWith('succeeded')) { log('libai 完成'); break }
      if (out.startsWith('failed')) throw new Error('libai 节点失败')
    } catch (e) { log(`轮询异常 ${e.message.slice(0, 80)}`) }
  }
  log('元数据已写 outputs/_nobel-libaionly-meta.json，等待外部提取')
})().catch(e => { console.error('❌', e.message); process.exit(1) })
