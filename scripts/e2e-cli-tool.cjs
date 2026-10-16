/**
 * 本地命令行工具 E2E（V1：kind=cli）
 * 1. saveCustom 建 CLI 工具（command=node, argsTemplate 用 {{param}} 占位, stdoutType=json）
 * 2. 建工作流 start → tool-call(该工具) → message，运行：参数映射为命令行参数 → 输出 JSON
 * 3. scanInstalled 返回 PATH 可执行程序（含 node）
 * 4. 清理：删除工具 + 工作流定义
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  let toolId = null
  let defId = null

  await step('scanInstalled：返回 PATH 可执行程序（含 node）', async () => {
    const r = await page.evaluate(async () => await window.electronAPI.tools.scanInstalled())
    assert(r.success, `scanInstalled 失败 ${r.error}`)
    const list = r.data ?? []
    assert(list.length > 5, `已装程序列表过短（${list.length}）`)
    assert(list.some(c => c.name.toLowerCase() === 'node'), '缺 node 可执行')
    console.log(`   已装程序 ${list.length} 个，含 node（${list.find(c => c.name.toLowerCase() === 'node')?.path}）`)
  })

  await step('建 CLI 工具：command=node + argsTemplate={{n}} + stdoutType=json', async () => {
    const r = await page.evaluate(async () => {
      const t = window.electronAPI.tools
      const resp = await t.saveCustom({
        name: 'E2E-CLI-Sum',
        description: '本地 node 计算 sum',
        kind: 'cli',
        method: 'CLI',
        url: '',
        command: 'node',
        argsTemplate: '-e "console.log(JSON.stringify({sum:{{n}},tag:\"cli\"}))"',
        stdoutType: 'json',
        timeoutMs: 15000,
        paramsSchema: [
          { key: 'n', label: '数字', type: 'string', required: true },
        ],
      })
      return resp.success ? { id: resp.data.id, kind: resp.data.kind, command: resp.data.command } : { error: resp.error }
    })
    assert(r.id, `建 CLI 工具失败 ${r.error}`)
    assert(r.kind === 'cli' && r.command === 'node', `kind/command 未保存 ${JSON.stringify(r)}`)
    toolId = r.id
    console.log(`   CLI 工具 ${toolId}（kind=${r.kind} command=${r.command}）`)
  })

  await step('建工作流：start → tool-call(CLI) → message', async () => {
    const r = await page.evaluate(async ({ toolId }) => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-CLI-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [{ key: 'n', label: '数字', type: 'string', required: true }] } },
          { id: 'tool1', type: 'tool-call', name: '本地计算', position: { x: 280, y: 200 }, config: { toolType: 'custom', toolId, params: [{ key: 'n', value: '{{start.n}}' }] } },
          { id: 'msg1', type: 'message', name: '输出', position: { x: 500, y: 200 }, config: { content: '结果：{{tool1.json.sum}}' } },
          { id: 'end', type: 'end', name: '结束', position: { x: 700, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 'tool1', kind: 'normal' },
          { id: 'e2', sourceNodeId: 'tool1', targetNodeId: 'msg1', kind: 'normal' },
          { id: 'e3', sourceNodeId: 'msg1', targetNodeId: 'end', kind: 'normal' },
        ],
      }
      const s = await wf.saveDraft(c.data.id, graph)
      if (!s.success) return { error: s.error }
      const p = await wf.publishDefinition({ id: c.data.id })
      if (!p.success) return { error: p.error }
      return { id: c.data.id }
    }, { toolId })
    assert(r.id, `建流失败 ${r.error}`)
    defId = r.id
  })

  await step('运行：CLI 工具执行成功，参数映射为命令行参数，输出 JSON', async () => {
    const r = await page.evaluate(async ({ defId }) => {
      const wf = window.electronAPI.workflow
      const st = await wf.startRun({ definitionId: defId, inputs: { n: '7' } })
      if (!st.success) return { error: st.error }
      for (let i = 0; i < 30; i++) {
        await new Promise(r2 => setTimeout(r2, 300))
        const d = await wf.getRun(st.data.id)
        if (!d.success) continue
        const run = d.data
        if (run.run?.status === 'succeeded' || run.run?.status === 'failed') {
          const tool = (run.nodeRuns ?? []).find(n => n.nodeType === 'tool-call')
          const msg = (run.nodeRuns ?? []).find(n => n.nodeType === 'message')
          return { runStatus: run.run.status, toolStatus: tool?.status, toolOut: tool?.output, msgContent: msg?.output?.content }
        }
      }
      return { error: '超时' }
    }, { defId })
    assert(r.runStatus === 'succeeded', `运行失败 ${JSON.stringify(r)}`)
    assert(r.toolStatus === 'succeeded', `CLI 工具执行失败：${r.toolStatus} ${JSON.stringify(r.toolOut)}`)
    assert(r.toolOut?.json?.sum === 7, `参数映射失败 ${JSON.stringify(r.toolOut)}`)
    assert(String(r.msgContent).includes('7'), `message 引用失败：${r.msgContent}`)
    console.log('   CLI 执行结果:', JSON.stringify({ sum: r.toolOut?.json?.sum, tag: r.toolOut?.json?.tag, text: r.toolOut?.text }))
  })

  await step('清理：删除工具 + 工作流定义', async () => {
    await page.evaluate(async ({ toolId, defId }) => {
      await window.electronAPI.tools.deleteCustom(toolId)
      await window.electronAPI.workflow.deleteDefinition(defId)
    }, { toolId, defId })
  })

  await browser.close()
  console.log('\n===== 本地命令行工具 E2E 全部通过 ✅ =====')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
