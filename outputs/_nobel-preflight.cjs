/**
 * 预检：在当前实例用「临时定义」灌 styled-long-form 图谱小样跑通
 * 验证点：skill-call 参数渲染（writing-styles 8参 / libai FINAL 分隔符）→ pack 切分 → report → save-asset
 * 结束后清理（会话/应用/定义）
 */
const fs = require('fs')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)

const NAME = '预检-风格库长文-' + Date.now().toString(36)
const GRAPH = JSON.parse(fs.readFileSync('src/core/database/migrations/builtin-apps/styled-long-form.json', 'utf-8')).graph

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

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
  log(`临时应用 ${ids.appId}`)

  const s = await page.evaluate(async (args) => {
    const c = await window.electronAPI.appSession.create({ appId: args.appId })
    if (!c.success) return { error: c.error }
    const st = await window.electronAPI.appSession.start({
      sessionId: c.data.id,
      inputs: {
        topic: '为什么天空是蓝色的（管线预检）',
        material: '',
        style: 'knowledge',
        platform: '公众号',
        word_count: '600字以内',
        intensity: '保守',
        keep: '直接引语一字不动；数字、日期与口径标注不得改',
        extra: '',
        current_content: '',
        feedback: '',
        model: { providerConfigId: 'pc_muuwsf3q_kzesid6qr', modelId: 'qwen3.8-max' },
        libaiModel: { providerConfigId: 'pc_mmyd3u5b_hkf5odex3', modelId: 'deepseek-v4-pro' },
      },
    })
    return st.success !== false ? { sid: c.data.id } : { error: st.error }
  }, ids)
  assert(s.sid, `启动失败 ${JSON.stringify(s)}`)
  log(`预检会话 ${s.sid}，等待完成…`)

  const t0 = Date.now()
  let report = null
  let fail = null
  const seen = new Set()
  while (Date.now() - t0 < 12 * 60 * 1000) {
    await sleep(5000)
    const cards = await page.evaluate(async (sid) => {
      const m = await window.electronAPI.appSession.messages(sid)
      return (m.data ?? []).filter(x => x.metadata?.sessionCard).map(x => ({ id: x.id, ...x.metadata.sessionCard }))
    }, s.sid)
    for (const c of cards) {
      if (c.card === 'node-status' && !seen.has(`${c.nodeId}:${c.status}`)) { seen.add(`${c.nodeId}:${c.status}`); log(`节点 ${c.nodeId} → ${c.status}`) }
      if (c.card === 'report') report = c
      if (c.card === 'message' && /运行(failed|timed_out|cancelled|interrupted)/.test(String(c.content ?? ''))) fail = c.content
    }
    if (report || fail) break
  }
  assert(!fail, `运行失败: ${fail}`)
  assert(report, '12 分钟未拿到报告卡')
  const md = String(report.markdown ?? '')
  log(`报告卡收到：${md.length} 字符`)
  assert(!md.includes('=====FINAL====='), '终稿仍含分隔符——切分失败')
  assert(md.includes('附二：去 AI 味诊断'), '缺少去AI味诊断段')
  console.log('\n----- 终稿前 500 字 -----\n' + md.slice(0, 500))
  console.log('\n----- 诊断段前 400 字 -----\n' + (md.split('附二：去 AI 味诊断')[1] ?? '').slice(0, 400))

  // 清理
  await page.evaluate(async (args) => {
    const list = await window.electronAPI.appSession.list(args.appId)
    for (const it of list.data ?? []) await window.electronAPI.appSession.delete(it.id)
    await window.electronAPI.app.delete(args.appId)
    await window.electronAPI.workflow.deleteDefinition(args.defId)
  }, ids)
  log('✅ 预检通过，临时产物已清理')
})().catch(e => { console.error('❌ 预检失败：', e.message); process.exit(1) })
