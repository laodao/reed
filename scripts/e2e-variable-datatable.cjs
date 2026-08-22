/**
 * P0 片4 E2E：变量（set→get 跨运行）+ 数据表（insert 自动建表 → query 全查）
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  // ---- 1. 变量：set 工作流 → get 工作流（跨运行持久化） ----
  let setDefId, getDefId
  await step('建变量 set 工作流（写入 counter）并发布', async () => {
    const r = await page.evaluate(async () => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-变量写-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [] } },
          { id: 'v1', type: 'variable', name: '写变量', position: { x: 280, y: 200 }, config: { op: 'set', scope: 'global', key: 'e2e_counter', value: '7' } },
          { id: 'end', type: 'end', name: '结束', position: { x: 480, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 'v1', kind: 'normal' },
          { id: 'e2', sourceNodeId: 'v1', targetNodeId: 'end', kind: 'normal' },
        ],
      }
      const s = await wf.saveDraft(c.data.id, graph)
      if (!s.success) return { error: s.error }
      const p = await wf.publishDefinition({ id: c.data.id })
      if (!p.success) return { error: p.error }
      return { id: c.data.id }
    })
    assert(r.id, `失败 ${r.error}`)
    setDefId = r.id
  })

  await step('建变量 get 工作流（读取 counter + 兜底）并发布', async () => {
    const r = await page.evaluate(async () => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-变量读-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [] } },
          { id: 'v1', type: 'variable', name: '读变量', position: { x: 280, y: 200 }, config: { op: 'get', scope: 'global', key: 'e2e_counter', defaultValue: '0' } },
          { id: 'msg1', type: 'message', name: '输出', position: { x: 500, y: 200 }, config: { content: 'counter={{v1.value}}' } },
          { id: 'end', type: 'end', name: '结束', position: { x: 700, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 'v1', kind: 'normal' },
          { id: 'e2', sourceNodeId: 'v1', targetNodeId: 'msg1', kind: 'normal' },
          { id: 'e3', sourceNodeId: 'msg1', targetNodeId: 'end', kind: 'normal' },
        ],
      }
      const s = await wf.saveDraft(c.data.id, graph)
      if (!s.success) return { error: s.error }
      const p = await wf.publishDefinition({ id: c.data.id })
      if (!p.success) return { error: p.error }
      return { id: c.data.id }
    })
    assert(r.id, `失败 ${r.error}`)
    getDefId = r.id
  })

  await step('运行写 → 运行读：跨运行读到 7', async () => {
    const r = await page.evaluate(async ({ setDefId, getDefId }) => {
      const wf = window.electronAPI.workflow
      const waitRun = async (defId) => {
        const st = await wf.startRun({ definitionId: defId, inputs: {} })
        if (!st.success) return { error: st.error }
        for (let i = 0; i < 30; i++) {
          await new Promise(r2 => setTimeout(r2, 300))
          const d = await wf.getRun(st.data.id)
          if (d.success && (d.data.run?.status === 'succeeded' || d.data.run?.status === 'failed')) {
            const msg = (d.data.nodeRuns ?? []).find(n => n.nodeType === 'message')
            return { status: d.data.run.status, msg: msg?.output?.content }
          }
        }
        return { error: '超时' }
      }
      const w1 = await waitRun(setDefId)
      if (w1.status !== 'succeeded') return { error: `写失败 ${JSON.stringify(w1)}` }
      const w2 = await waitRun(getDefId)
      return w2
    }, { setDefId, getDefId })
    assert(r.status === 'succeeded', `读失败 ${JSON.stringify(r)}`)
    assert(String(r.msg).includes('counter=7'), `跨运行变量读取异常：${r.msg}`)
    console.log('   跨运行变量:', r.msg)
  })

  // ---- 2. 数据表：insert 自动建表 → query 全查（同一次运行内） ----
  await step('数据表：insert（自动建表+两行）→ query 返回两行', async () => {
    const r = await page.evaluate(async () => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-数据表-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [] } },
          { id: 't1', type: 'data-table', name: '插入行1', position: { x: 280, y: 140 }, config: { op: 'insert', tableName: 'e2e_orders', row: '{"name":"苹果","qty":3}' } },
          { id: 't2', type: 'data-table', name: '插入行2', position: { x: 280, y: 260 }, config: { op: 'insert', tableName: 'e2e_orders', row: '{"name":"香蕉","qty":5}' } },
          { id: 'q1', type: 'data-table', name: '查询', position: { x: 500, y: 200 }, config: { op: 'query', tableName: 'e2e_orders' } },
          { id: 'msg1', type: 'message', name: '输出', position: { x: 700, y: 200 }, config: { content: '行数={{q1.rows.length}} 首行={{q1.rows[0].name}}:{{q1.rows[0].qty}}' } },
          { id: 'end', type: 'end', name: '结束', position: { x: 900, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 't1', kind: 'normal' },
          { id: 'e2', sourceNodeId: 't1', targetNodeId: 't2', kind: 'normal' },
          { id: 'e3', sourceNodeId: 't2', targetNodeId: 'q1', kind: 'normal' },
          { id: 'e4', sourceNodeId: 'q1', targetNodeId: 'msg1', kind: 'normal' },
          { id: 'e5', sourceNodeId: 'msg1', targetNodeId: 'end', kind: 'normal' },
        ],
      }
      const s = await wf.saveDraft(c.data.id, graph)
      if (!s.success) return { error: s.error }
      const p = await wf.publishDefinition({ id: c.data.id })
      if (!p.success) return { error: p.error }
      const st = await wf.startRun({ definitionId: c.data.id, inputs: {} })
      if (!st.success) return { error: st.error }
      for (let i = 0; i < 30; i++) {
        await new Promise(r2 => setTimeout(r2, 300))
        const d = await wf.getRun(st.data.id)
        if (d.success && (d.data.run?.status === 'succeeded' || d.data.run?.status === 'failed')) {
          const msg = (d.data.nodeRuns ?? []).find(n => n.nodeType === 'message')
          const q = (d.data.nodeRuns ?? []).find(n => n.nodeType === 'data-table' && n.nodeName === '查询')
          return { status: d.data.run.status, msg: msg?.output?.content, rows: q?.output?.rows }
        }
      }
      return { error: '超时' }
    })
    assert(r.status === 'succeeded', `数据表失败 ${JSON.stringify(r)}`)
    assert(Array.isArray(r.rows) && r.rows.length === 2, `查询行数异常 ${JSON.stringify(r.rows)}`)
    assert(String(r.msg).includes('行数=2'), `消息异常 ${r.msg}`)
    console.log('   数据表:', JSON.stringify(r.rows))
  })

  console.log('\n===== P0 片4 变量与数据表 E2E 通过 ✅ =====')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
