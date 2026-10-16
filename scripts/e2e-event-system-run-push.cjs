/**
 * 事件系统 M1 收尾 E2E：验证引擎事件经"平台事件总线 → ipc 通道 → wf:run-event"
 * 送达渲染进程（前端零改动契约，10-event-system §9）。
 *
 * 步骤：建工作流(start→message→end) → 发布 → preload onRunEvent 订阅 →
 * startRun → 断言前端收到该 run 的 node-status/run-status 五型载荷
 * （字段级检查：type/runId/status 等判别字段齐全），直到终态。
 *
 * 前置：应用以 --remote-debugging-port=9333 运行（boot 日志应含
 * [EventBus] 平台事件总线已启动 + [IpcEventChannel] 已挂接）。
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

const WF_NAME = `E2E-事件系统-run推送-${Date.now().toString(36)}`
const GRAPH = {
  version: 1,
  nodes: [
    { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 300 }, config: { inputs: [] } },
    { id: 'msg', type: 'message', name: '输出问候', position: { x: 320, y: 300 }, config: { content: '事件系统通道验证' } },
    { id: 'end', type: 'end', name: '结束', position: { x: 560, y: 300 }, config: {} },
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'start', targetNodeId: 'msg', kind: 'normal' },
    { id: 'e2', sourceNodeId: 'msg', targetNodeId: 'end', kind: 'normal' },
  ],
}
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'skipped', 'timed_out', 'interrupted'])

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  assert(page, '未找到应用窗口')

  let defId, runId

  await step('1. 建工作流 + 发布', async () => {
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

  await step('2. preload onRunEvent 订阅（wf:run-event 原通道，前端零改动路径）', async () => {
    await page.evaluate(() => {
      window.__wfRunEvents = []
      window.__wfRunEventOff = window.electronAPI.workflow.onRunEvent(e => {
        window.__wfRunEvents.push(e)
      })
    })
  })

  await step('3. startRun → 前端收到五型载荷直至终态', async () => {
    const started = await page.evaluate(async (id) => {
      const resp = await window.electronAPI.workflow.startRun({ definitionId: id, inputs: {} })
      return resp.success ? resp.data : { error: resp.error }
    }, defId)
    assert(started.runId || started.id, `启动失败 ${JSON.stringify(started)}`)
    runId = started.runId ?? started.id

    let events = []
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250))
      events = await page.evaluate(() => window.__wfRunEvents)
      const mine = events.filter(e => e.runId === runId)
      if (mine.some(e => e.type === 'run-status' && TERMINAL.has(e.status))) break
    }
    const mine = events.filter(e => e.runId === runId)
    assert(mine.length > 0, `前端未收到该 run 的 wf:run-event（全部事件数=${events.length}）`)

    // 字段级断言：五型判别字段齐全
    const nodeEvents = mine.filter(e => e.type === 'node-status')
    const statusEvents = mine.filter(e => e.type === 'run-status')
    assert(nodeEvents.length > 0, '缺 node-status 事件')
    assert(statusEvents.length > 0, '缺 run-status 事件')
    for (const e of nodeEvents) {
      assert(typeof e.nodeId === 'string' && typeof e.iterationIndex === 'number' && typeof e.status === 'string',
        `node-status 字段缺失: ${JSON.stringify(e)}`)
    }
    for (const e of statusEvents) {
      assert(typeof e.definitionId === 'string' && typeof e.status === 'string',
        `run-status 字段缺失: ${JSON.stringify(e)}`)
    }
    const terminal = statusEvents.find(e => TERMINAL.has(e.status))
    assert(terminal, `未收到终态 run-status（收到: ${statusEvents.map(e => e.status).join(',')}）`)
    assert(terminal.status === 'succeeded', `终态非 succeeded: ${terminal.status} ${terminal.error ?? ''}`)
    console.log(`   收到事件 ${mine.length} 条：node-status=${nodeEvents.length} run-status=${statusEvents.length}，终态=${terminal.status}`)
    console.log(`   序列: ${mine.map(e => e.type === 'node-status' ? `${e.nodeId}:${e.status}` : `run:${e.status}`).join(' → ')}`)
  })

  await step('4. 清理订阅', async () => {
    await page.evaluate(() => { window.__wfRunEventOff?.(); window.__wfRunEvents = [] })
  })

  console.log('\n🎉 wf:run-event 前端实时推送（平台事件总线 → ipc 通道路径）验证通过')
  process.exit(0)
})().catch(e => { console.error('\n💥', e.message); process.exit(1) })
