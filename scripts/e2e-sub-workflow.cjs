/**
 * P0 片3 E2E：子工作流嵌套（子流程 message 输出 → 父流程 sub-workflow 节点取结果）
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  let subDefId, parentDefId
  await step('建子工作流（start[name] → message 输出）并发布', async () => {
    const r = await page.evaluate(async () => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-子流程-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [{ key: 'name', label: '名字', type: 'string', required: true }] } },
          { id: 'msg', type: 'message', name: '子流程输出', position: { x: 280, y: 200 }, config: { content: '子流程处理完成：{{start.name}}（v2 逻辑）' } },
          { id: 'end', type: 'end', name: '结束', position: { x: 480, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 'msg', kind: 'normal' },
          { id: 'e2', sourceNodeId: 'msg', targetNodeId: 'end', kind: 'normal' },
        ],
      }
      const s = await wf.saveDraft(c.data.id, graph)
      if (!s.success) return { error: s.error }
      const p = await wf.publishDefinition({ id: c.data.id })
      if (!p.success) return { error: p.error }
      return { id: c.data.id }
    })
    assert(r.id, `建子流失败 ${r.error}`)
    subDefId = r.id
  })

  await step('建父工作流（sub-workflow 引用子流程）并发布', async () => {
    const r = await page.evaluate(async (subId) => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-父流程-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [{ key: 'who', label: '名字', type: 'string', defaultValue: '张三' }] } },
          { id: 'sub1', type: 'sub-workflow', name: '调子流程', position: { x: 280, y: 200 }, config: { definitionId: subId, inputs: [{ key: 'name', value: '{{start.who}}' }] } },
          { id: 'msg1', type: 'message', name: '父流程输出', position: { x: 500, y: 200 }, config: { content: '父流程收到：{{sub1.result}}（runId={{sub1.runId}}）' } },
          { id: 'end', type: 'end', name: '结束', position: { x: 700, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 'sub1', kind: 'normal' },
          { id: 'e2', sourceNodeId: 'sub1', targetNodeId: 'msg1', kind: 'normal' },
          { id: 'e3', sourceNodeId: 'msg1', targetNodeId: 'end', kind: 'normal' },
        ],
      }
      const s = await wf.saveDraft(c.data.id, graph)
      if (!s.success) return { error: s.error }
      const p = await wf.publishDefinition({ id: c.data.id })
      if (!p.success) return { error: p.error }
      return { id: c.data.id }
    }, subDefId)
    assert(r.id, `建父流失败 ${r.error}`)
    parentDefId = r.id
  })

  await step('运行父流程：sub-workflow 成功 + 子运行产生 + 结果透传', async () => {
    const r = await page.evaluate(async (defId) => {
      const wf = window.electronAPI.workflow
      const st = await wf.startRun({ definitionId: defId, inputs: { who: '李四' } })
      if (!st.success) return { error: st.error }
      for (let i = 0; i < 40; i++) {
        await new Promise(r2 => setTimeout(r2, 400))
        const d = await wf.getRun(st.data.id)
        if (!d.success) continue
        if (d.data.run?.status === 'succeeded' || d.data.run?.status === 'failed') {
          const sub = (d.data.nodeRuns ?? []).find(n => n.nodeType === 'sub-workflow')
          const msg = (d.data.nodeRuns ?? []).find(n => n.nodeType === 'message')
          return { runStatus: d.data.run.status, subStatus: sub?.status, subOut: sub?.output, msgContent: msg?.output?.content }
        }
      }
      return { error: '超时' }
    }, parentDefId)
    assert(r.runStatus === 'succeeded', `父运行失败 ${JSON.stringify(r)}`)
    assert(r.subStatus === 'succeeded', `sub-workflow 未成功 ${r.subStatus} ${JSON.stringify(r.subOut)}`)
    assert(String(r.subOut?.result).includes('子流程处理完成：李四'), `子流程结果异常 ${JSON.stringify(r.subOut)}`)
    assert(r.subOut?.runId?.startsWith('wfrun_'), `子运行 id 缺失 ${r.subOut?.runId}`)
    assert(String(r.msgContent).includes('父流程收到：子流程处理完成：李四'), `父流程引用失败 ${r.msgContent}`)
    console.log('   子运行:', r.subOut?.runId, '| result:', r.subOut?.result)
  })

  console.log('\n===== P0 片3 子工作流 E2E 通过 ✅ =====')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
