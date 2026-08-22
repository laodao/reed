/**
 * P0 片1 E2E 验证：第三方 API 工具
 * 1. 预设工具列表 → 2. 保存凭据（加密）→ 3. 建自定义工具（指向本地 mock API）
 * 4. 建工作流（start → tool-call → message）→ 5. 运行验证：参数映射 + 凭据注入 + 输出 JSON
 */
const http = require('http')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

// ---- 本地 mock API（记录请求头供凭据注入断言） ----
let lastHeaders = null
const server = http.createServer((req, res) => {
  lastHeaders = req.headers
  const url = new URL(req.url, 'http://127.0.0.1:18789')
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ ok: true, id: url.pathname.split('/').pop(), q: url.searchParams.get('q'), receivedAuth: req.headers.authorization ?? null }))
})
const PORT = 18789

;(async () => {
  await new Promise(res => server.listen(PORT, '127.0.0.1', res))

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')
  const tools = () => window.electronAPI.tools

  // ---- 1. 预设工具 ----
  let credId, toolId, defId
  await step('预设工具列表（≥6 个，含 web-search/天气/翻译等）', async () => {
    const r = await page.evaluate(async () => (await window.electronAPI.tools.presets()).data ?? [])
    assert(r.length >= 6, `预设工具数异常 ${r.length}`)
    assert(r.some(t => t.id === 'preset:web-search'), '缺 web-search 预设')
  })

  // ---- 2. 凭据（加密保存） ----
  await step('保存凭据：API Key 加密落库（列表返回密文非明文）', async () => {
    const r = await page.evaluate(async () => {
      const saved = await window.electronAPI.tools.saveCredential({ name: 'E2E-Test-Key', apiKey: 'sk-e2e-secret-123' })
      if (!saved.success) return { error: saved.error }
      const list = await window.electronAPI.tools.listCredentials()
      return { id: saved.data.id, enc: saved.data.apiKeyEnc, listNames: (list.data ?? []).map(c => c.name) }
    })
    assert(r.id, `保存失败 ${r.error}`)
    assert(r.enc.includes('enc:') || !r.enc.includes('sk-e2e-secret'), `密钥未加密：${r.enc}`)
    credId = r.id
  })

  // ---- 3. 自定义工具（指向本地 mock + credential 鉴权） ----
  await step('建自定义工具：GET /items/{{id}} + credential 鉴权', async () => {
    const r = await page.evaluate(async (port) => {
      const resp = await window.electronAPI.tools.saveCustom({
        name: 'E2E-Mock-Item',
        description: '本地 mock 接口',
        method: 'GET',
        url: `http://127.0.0.1:${port}/items/{{id}}`,
        headers: [],
        paramsSchema: [
          { key: 'id', label: 'ID', type: 'string', required: true },
          { key: 'q', label: '查询', type: 'string' },
        ],
        authType: 'credential',
        credentialId: null,
      })
      return resp.success ? { id: resp.data.id } : { error: resp.error }
    }, PORT)
    assert(r.id, `建工具失败 ${r.error}`)
    toolId = r.id
  })

  // ---- 4. 建工作流（tool-call） ----
  await step('建工作流：start → tool-call → message', async () => {
    const r = await page.evaluate(async ({ toolId, credId, port }) => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-工具-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [{ key: 'itemId', label: '商品 ID', type: 'string', required: true }] } },
          { id: 'tool1', type: 'tool-call', name: '调用工具', position: { x: 280, y: 200 }, config: { toolType: 'custom', toolId, credentialId: credId, params: [{ key: 'id', value: '{{start.itemId}}' }, { key: 'q', value: '测试' }] } },
          { id: 'msg1', type: 'message', name: '输出', position: { x: 500, y: 200 }, config: { content: '结果：{{tool1.json.id}}（q={{tool1.json.q}}）auth={{tool1.json.receivedAuth}}' } },
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
    }, { toolId, credId, port: PORT })
    assert(r.id, `建流失败 ${r.error}`)
    defId = r.id
  })

  // ---- 5. 运行验证 ----
  await step('运行：tool-call 成功 + 参数映射（path/query）+ 凭据 Bearer 注入', async () => {
    const r = await page.evaluate(async ({ defId }) => {
      const wf = window.electronAPI.workflow
      const st = await wf.startRun({ definitionId: defId, inputs: { itemId: 'item-42' } })
      if (!st.success) return { error: st.error }
      for (let i = 0; i < 30; i++) {
        await new Promise(r2 => setTimeout(r2, 300))
        const d = await wf.getRun(st.data.id)
        if (!d.success) continue
        const run = d.data
        if (run.run?.status === 'succeeded' || run.run?.status === 'failed') {
          const tool = (run.nodeRuns ?? []).find(n => n.nodeType === 'tool-call')
          const msg = (run.nodeRuns ?? []).find(n => n.nodeType === 'message')
          return {
            runStatus: run.run.status,
            toolStatus: tool?.status,
            toolOut: tool?.output,
            msgContent: msg?.output?.content,
          }
        }
      }
      return { error: '超时' }
    }, { defId })
    assert(r.runStatus === 'succeeded', `运行失败 ${JSON.stringify(r)}`)
    assert(r.toolStatus === 'succeeded', `tool-call 未成功：${r.toolStatus} ${JSON.stringify(r.toolOut)}`)
    assert(r.toolOut?.json?.id === 'item-42', `path 参数映射失败 ${JSON.stringify(r.toolOut)}`)
    assert(r.toolOut?.json?.q === '测试', `query 参数映射失败 ${JSON.stringify(r.toolOut)}`)
    assert(String(r.toolOut?.json?.receivedAuth).includes('Bearer sk-e2e-secret-123'), `凭据未注入 ${JSON.stringify(r.toolOut)}`)
    assert(String(r.msgContent).includes('item-42'), `message 引用失败：${r.msgContent}`)
    console.log('   运行详情:', JSON.stringify({ runStatus: r.runStatus, toolStatus: r.toolStatus, json: r.toolOut?.json }))
  })

  server.close()
  console.log('\n===== P0 片1 工具 E2E 全部通过 ✅ =====')
  process.exit(0)
})().catch(e => { server.close(); console.error('FAIL:', e.message); process.exit(1) })
