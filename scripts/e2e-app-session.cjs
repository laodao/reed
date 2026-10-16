/**
 * 应用模块 E2E：建工作流→发布→建应用→开会话→运行→会话流出现结果卡片
 * 覆盖：app:create-from-workflow / app-session:create/start/messages / 事件桥写卡
 * 前置：electron-vite dev --remote-debugging-port=9222（需已重启，含 app 模块代码）
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

const WF_NAME = `E2E-应用会话-${Date.now().toString(36)}`
const GRAPH = {
  version: 1,
  nodes: [
    { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 300 }, config: { inputs: [] } },
    { id: 'msg', type: 'message', name: '输出问候', position: { x: 320, y: 300 }, config: { content: '应用会话运行成功：{{start.name | default("朋友")}}' } },
    { id: 'end', type: 'end', name: '结束', position: { x: 560, y: 300 }, config: {} },
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'start', targetNodeId: 'msg', kind: 'normal' },
    { id: 'e2', sourceNodeId: 'msg', targetNodeId: 'end', kind: 'normal' },
  ],
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  let defId, appId, sessionId

  await step('1. 建工作流+发布', async () => {
    const r = await page.evaluate(async (args) => {
      const wf = window.electronAPI.workflow
      const created = await wf.createDefinition({ name: args.name })
      if (!created.success) return { error: created.error }
      await wf.saveDraft(created.data.id, args.graph)
      const pub = await wf.publishDefinition({ id: created.data.id })
      return pub.success ? { id: created.data.id } : { error: pub.error }
    }, { name: WF_NAME, graph: GRAPH })
    assert(r.id, `建图失败 ${r.error}`)
    defId = r.id
  })

  await step('2. app:create-from-workflow → 应用存在', async () => {
    const r = await page.evaluate(async (defId) => {
      const resp = await window.electronAPI.app.createFromWorkflow({ definitionId: defId })
      return resp.success ? { id: resp.data.id, name: resp.data.name, channels: { session: resp.data.channelSession } } : { error: resp.error }
    }, defId)
    assert(r.id && r.channels.session === 1, `建应用失败 ${r.error}`)
    appId = r.id
  })

  await step('3. app-session:create → 会话 + 首条 start-form 卡片', async () => {
    const r = await page.evaluate(async (appId) => {
      const s = await window.electronAPI.appSession.create({ appId })
      if (!s.success) return { error: s.error }
      const msgs = await window.electronAPI.appSession.messages(s.data.id)
      return { id: s.data.id, msgCount: msgs.data?.length ?? 0, first: msgs.data?.[0]?.metadata?.sessionCard }
    }, appId)
    assert(r.id && r.msgCount >= 1, `会话/卡片缺失 ${JSON.stringify(r)}`)
    assert(r.first?.card === 'start-form', '首条卡片非 start-form')
    sessionId = r.id
  })

  await step('4. app-session:start → 运行（message 节点）+ 会话流出现结果卡片', async () => {
    const started = await page.evaluate(async (sid) => {
      const resp = await window.electronAPI.appSession.start({ sessionId: sid, inputs: {} })
      return resp.success ? resp.data : { error: resp.error }
    }, sessionId)
    assert(started.runId, `启动失败 ${started.error}`)
    // 轮询消息直到出现 message 结果卡（跳过 node-status 噪声）
    let cards = []
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 300))
      const msgs = await page.evaluate(async (sid) => {
        const resp = await window.electronAPI.appSession.messages(sid)
        return resp.data ?? []
      }, sessionId)
      cards = msgs.flatMap(m => m.metadata?.sessionCard ? [m.metadata.sessionCard] : [])
      if (cards.some(c => c.card === 'message')) break
    }
    console.log('   卡片序列:', cards.map(c => c.card).join(' › '))
    const result = cards.find(c => c.card === 'message')
    assert(result, '未收到结果卡片')
    assert(String(result.content).includes('应用会话运行成功'), `结果内容异常: ${result.content}`)
  })

  await step('5. 会话含 run-status 卡片（运行中状态已记录）', async () => {
    const cards = await page.evaluate(async (sid) => {
      const resp = await window.electronAPI.appSession.messages(sid)
      return (resp.data ?? []).flatMap(m => m.metadata?.sessionCard ? [m.metadata.sessionCard] : [])
    }, sessionId)
    assert(cards.some(c => c.card === 'run-status'), '缺 run-status 卡片')
  })

  console.log('\n===== 应用会话 E2E 全部通过 ✅  appId=', appId, 'sessionId=', sessionId)
  process.exit(0)
})().catch(e => { console.error('E2E FAIL:', e.message); process.exit(1) })