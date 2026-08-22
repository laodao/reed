/**
 * P0 片2 E2E：代码节点（start → code 数据处理 → message 输出）
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  let defId
  await step('建工作流：start → code（统计+聚合）→ message', async () => {
    const r = await page.evaluate(async () => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-代码-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [{ key: 'numbers', label: '数字（逗号分隔）', type: 'string', defaultValue: '1,2,3,4' }] } },
          { id: 'code1', type: 'code', name: '数据处理', position: { x: 280, y: 200 }, config: {
            language: 'js',
            code: `const arr = String(inputs.numbers ?? '').split(',').map(Number).filter(n => !Number.isNaN(n));\nreturn { count: arr.length, sum: arr.reduce((a, b) => a + b, 0), avg: arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0 }`,
            inputs: [{ key: 'numbers', value: '{{start.numbers}}' }],
          } },
          { id: 'msg1', type: 'message', name: '输出', position: { x: 500, y: 200 }, config: { content: '个数={{code1.result.count}} 和={{code1.result.sum}} 平均={{code1.result.avg}}' } },
          { id: 'end', type: 'end', name: '结束', position: { x: 700, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 'code1', kind: 'normal' },
          { id: 'e2', sourceNodeId: 'code1', targetNodeId: 'msg1', kind: 'normal' },
          { id: 'e3', sourceNodeId: 'msg1', targetNodeId: 'end', kind: 'normal' },
        ],
      }
      const s = await wf.saveDraft(c.data.id, graph)
      if (!s.success) return { error: s.error }
      const p = await wf.publishDefinition({ id: c.data.id })
      if (!p.success) return { error: p.error }
      return { id: c.data.id }
    })
    assert(r.id, `建流失败 ${r.error}`)
    defId = r.id
  })

  await step('运行：code 节点 succeeded，输出 count=4 sum=10 avg=2.5', async () => {
    const r = await page.evaluate(async (defId) => {
      const wf = window.electronAPI.workflow
      const st = await wf.startRun({ definitionId: defId, inputs: { numbers: '1,2,3,4' } })
      if (!st.success) return { error: st.error }
      for (let i = 0; i < 30; i++) {
        await new Promise(r2 => setTimeout(r2, 300))
        const d = await wf.getRun(st.data.id)
        if (!d.success) continue
        if (d.data.run?.status === 'succeeded' || d.data.run?.status === 'failed') {
          const code = (d.data.nodeRuns ?? []).find(n => n.nodeType === 'code')
          const msg = (d.data.nodeRuns ?? []).find(n => n.nodeType === 'message')
          return { runStatus: d.data.run.status, codeStatus: code?.status, codeOut: code?.output, msgContent: msg?.output?.content }
        }
      }
      return { error: '超时' }
    }, defId)
    assert(r.runStatus === 'succeeded', `运行失败 ${JSON.stringify(r)}`)
    assert(r.codeStatus === 'succeeded', `code 未成功 ${r.codeStatus}`)
    assert(r.codeOut?.result?.count === 4 && r.codeOut?.result?.sum === 10 && r.codeOut?.result?.avg === 2.5, `计算错误 ${JSON.stringify(r.codeOut)}`)
    assert(String(r.msgContent).includes('和=10'), `message 引用失败 ${r.msgContent}`)
    console.log('   结果:', JSON.stringify(r.codeOut?.result), '|', r.msgContent)
  })

  console.log('\n===== P0 片2 代码节点 E2E 通过 ✅ =====')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
