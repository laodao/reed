/**
 * 二进制响应支持 E2E（responseType：file 落盘 / base64 / auto）：
 * 1. 本地 HTTP 服务器返回二进制音频字节（模拟 Azure/OpenAI TTS 这类纯二进制流平台）
 * 2. 自定义工具（GET 该 URL）→ tool-call(responseType=file) → save-asset → 验证资产落库+磁盘内容一致
 * 3. tool-call(responseType=base64) → save-asset(data:) → 验证落库
 * 4. auto 模式二进制自动落盘验证
 * 5. 清理：E2E 工作流/资产/工具 + 停服务器
 */
const fs = require('fs')
const path = require('path')
const http = require('http')
const { DatabaseSync } = require('node:sqlite')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

const DATA_PATH = 'C:\\Users\\daoge\\the-bot'
const DB_PATH = path.join(DATA_PATH, 'the_bot.db')
const AUDIO_BYTES = Buffer.concat([
  Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'binary'), // MP3 头
  Buffer.from(Array.from({ length: 8192 }, (_, i) => (i * 7 + 3) % 256)), // 伪音频数据
])

function queryDb(sql, params = []) {
  const db = new DatabaseSync(DB_PATH)
  try {
    return db.prepare(sql).all(...params)
  } finally {
    db.close()
  }
}

// 本地二进制 HTTP 服务器（模拟 TTS 平台返回原始音频流）
const server = http.createServer((req, res) => {
  if (req.url === '/tts') {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': AUDIO_BYTES.length })
    res.end(AUDIO_BYTES)
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, url: `http://127.0.0.1:${server.address().port}/tts` }))
  }
})

;(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const ttsUrl = `http://127.0.0.1:${port}/tts`
  console.log(`本地 TTS 模拟服务器: ${ttsUrl}（${AUDIO_BYTES.length} 字节二进制）`)

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  let defId
  let toolId
  let assetIds = []

  await step('创建自定义工具（GET 二进制音频接口）', async () => {
    const r = await page.evaluate(async (url) => {
      const t = window.electronAPI.tools
      const c = await t.saveCustom({
        name: `E2E-二进制TTS-${Date.now().toString(36)}`,
        description: '模拟返回原始二进制音频的平台 TTS',
        method: 'GET',
        url,
        paramsSchema: [],
      })
      return c.success ? { id: c.data.id } : { error: c.error }
    }, ttsUrl)
    assert(r.id, `建工具失败 ${r.error}`)
    toolId = r.id
  })

  await step('建工作流：tool-call(file) → save-asset → message', async () => {
    const r = await page.evaluate(async (toolId) => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-二进制响应-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [] } },
          { id: 'tool1', type: 'tool-call', name: '调用TTS', position: { x: 260, y: 200 }, config: { toolType: 'custom', toolId, responseType: 'file', params: [] } },
          { id: 'save1', type: 'save-asset', name: '保存音频', position: { x: 460, y: 200 }, config: { content: '{{tool1.filePath}}', kind: 'file', category: 'audio', name: '自定义TTS音频.mp3', tags: 'E2E' } },
          { id: 'msg1', type: 'message', name: '提示', position: { x: 660, y: 200 }, config: { content: '已保存：{{save1.name}} / {{tool1.mimeType}} / {{tool1.sizeBytes}} 字节' } },
          { id: 'end', type: 'end', name: '结束', position: { x: 860, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 'tool1', kind: 'normal' },
          { id: 'e2', sourceNodeId: 'tool1', targetNodeId: 'save1', kind: 'normal' },
          { id: 'e3', sourceNodeId: 'save1', targetNodeId: 'msg1', kind: 'normal' },
          { id: 'e4', sourceNodeId: 'msg1', targetNodeId: 'end', kind: 'normal' },
        ],
      }
      const s = await wf.saveDraft(c.data.id, graph)
      if (!s.success) return { error: s.error }
      const p = await wf.publishDefinition({ id: c.data.id })
      if (!p.success) return { error: p.error }
      return { id: c.data.id }
    }, toolId)
    assert(r.id, `建工作流失败 ${r.error}`)
    defId = r.id
  })

  await step('运行（file 模式）：二进制落盘 → save-asset 复制 → 资产库', async () => {
    const r = await page.evaluate(async (defId) => {
      const wf = window.electronAPI.workflow
      const started = await wf.startRun({ definitionId: defId, inputs: {} })
      if (!started.success) return { error: started.error }
      for (let i = 0; i < 40; i++) {
        await new Promise(r2 => setTimeout(r2, 300))
        const run = await wf.getRun(started.data.id)
        if (!run.success) continue
        const status = run.data?.run?.status
        if (status === 'succeeded') {
          const detail = await wf.getRun(started.data.id)
          const nodes = detail.data?.nodeRuns ?? []
          const tool = nodes.find(n => n.nodeId === 'tool1')
          const msg = nodes.find(n => n.nodeId === 'msg1')
          return { toolOut: tool?.output, msgContent: msg?.output?.content }
        }
        if (status === 'failed') return { error: `运行失败: ${run.data?.run?.error}` }
      }
      return { error: '超时' }
    }, defId)
    assert(!r.error, r.error)
    assert(r.toolOut?.filePath && r.toolOut?.mimeType === 'audio/mpeg' && r.toolOut?.sizeBytes === AUDIO_BYTES.length, `tool 输出异常 ${JSON.stringify(r.toolOut)}`)
    assert(r.msgContent?.includes('自定义TTS音频.mp3'), `消息异常 ${r.msgContent}`)
    console.log('   tool-call 输出:', JSON.stringify(r.toolOut))
    console.log('   消息:', r.msgContent)
  })

  await step('验证资产：落库 + 磁盘内容与服务器字节完全一致', async () => {
    const rows = queryDb(`SELECT id, name, category, kind, storage_path, mime_type, size_bytes FROM assets WHERE name = '自定义TTS音频.mp3' ORDER BY created_at DESC LIMIT 1`)
    assert(rows.length === 1, `资产未落库 ${JSON.stringify(rows)}`)
    const a = rows[0]
    assert(a.category === 'audio' && a.kind === 'file' && a.mime_type === 'audio/mpeg' && a.size_bytes === AUDIO_BYTES.length, `资产元数据异常 ${JSON.stringify(a)}`)
    const abs = path.join(DATA_PATH, a.storage_path)
    assert(fs.existsSync(abs), `资产文件不存在: ${abs}`)
    const onDisk = fs.readFileSync(abs)
    assert(onDisk.equals(AUDIO_BYTES), '资产文件内容与服务器字节不一致！')
    console.log('   落盘:', a.storage_path, `（${onDisk.length} 字节，内容一致 ✓）`)
    assetIds.push(a.id)
  })

  await step('base64 模式：tool-call(base64) → save-asset(data:) 落库', async () => {
    const r = await page.evaluate(async (toolId) => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-Base64-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [] } },
          { id: 'tool1', type: 'tool-call', name: 'TTS-base64', position: { x: 260, y: 200 }, config: { toolType: 'custom', toolId, responseType: 'base64', params: [] } },
          { id: 'save1', type: 'save-asset', name: '保存', position: { x: 460, y: 200 }, config: { content: '{{tool1.dataUrl}}', kind: 'file', category: 'audio', name: 'Base64音频.mp3' } },
          { id: 'end', type: 'end', name: '结束', position: { x: 660, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 'tool1', kind: 'normal' },
          { id: 'e2', sourceNodeId: 'tool1', targetNodeId: 'save1', kind: 'normal' },
          { id: 'e3', sourceNodeId: 'save1', targetNodeId: 'end', kind: 'normal' },
        ],
      }
      await wf.saveDraft(c.data.id, graph)
      await wf.publishDefinition({ id: c.data.id })
      const started = await wf.startRun({ definitionId: c.data.id, inputs: {} })
      if (!started.success) return { error: started.error }
      for (let i = 0; i < 40; i++) {
        await new Promise(r2 => setTimeout(r2, 300))
        const run = await wf.getRun(started.data.id)
        if (!run.success) continue
        const status = run.data?.run?.status
        if (status === 'succeeded') {
          const detail = await wf.getRun(started.data.id)
          const tool = (detail.data?.nodeRuns ?? []).find(n => n.nodeId === 'tool1')
          return { toolOut: tool?.output }
        }
        if (status === 'failed') return { error: `运行失败: ${run.data?.run?.error}` }
      }
      return { error: '超时' }
    }, toolId)
    assert(!r.error, r.error)
    assert(r.toolOut?.dataUrl?.startsWith('data:audio/mpeg;base64,'), `dataUrl 输出异常 ${JSON.stringify(r.toolOut)}`)
    const decoded = Buffer.from(r.toolOut.dataUrl.split(',')[1], 'base64')
    assert(decoded.equals(AUDIO_BYTES), 'base64 解码与服务器字节不一致')
    console.log(`   base64 模式 ✓（dataUrl ${r.toolOut.dataUrl.length} 字符 ≈ ${decoded.length} 字节）`)
    const rows = queryDb(`SELECT id, category, kind, storage_path FROM assets WHERE name = 'Base64音频.mp3' ORDER BY created_at DESC LIMIT 1`)
    assert(rows.length === 1 && rows[0].category === 'audio' && rows[0].kind === 'file', `dataUrl 资产未落库 ${JSON.stringify(rows)}`)
    const abs = path.join(DATA_PATH, rows[0].storage_path)
    assert(fs.existsSync(abs) && fs.readFileSync(abs).equals(AUDIO_BYTES), 'dataUrl 落盘内容不一致')
    console.log('   dataUrl → save-asset 落盘:', rows[0].storage_path)
    if (rows.length) assetIds.push(rows[0].id)
  })

  await step('auto 模式：二进制响应自动落盘（不显式指定 responseType）', async () => {
    const r = await page.evaluate(async (toolId) => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-Auto-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [] } },
          { id: 'tool1', type: 'tool-call', name: 'TTS-auto', position: { x: 260, y: 200 }, config: { toolType: 'custom', toolId, params: [] } },
          { id: 'end', type: 'end', name: '结束', position: { x: 460, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 'tool1', kind: 'normal' },
          { id: 'e2', sourceNodeId: 'tool1', targetNodeId: 'end', kind: 'normal' },
        ],
      }
      await wf.saveDraft(c.data.id, graph)
      await wf.publishDefinition({ id: c.data.id })
      const started = await wf.startRun({ definitionId: c.data.id, inputs: {} })
      if (!started.success) return { error: started.error }
      for (let i = 0; i < 40; i++) {
        await new Promise(r2 => setTimeout(r2, 300))
        const run = await wf.getRun(started.data.id)
        if (!run.success) continue
        const status = run.data?.run?.status
        if (status === 'succeeded') {
          const detail = await wf.getRun(started.data.id)
          const tool = (detail.data?.nodeRuns ?? []).find(n => n.nodeId === 'tool1')
          return { toolOut: tool?.output }
        }
        if (status === 'failed') return { error: `运行失败: ${run.data?.run?.error}` }
      }
      return { error: '超时' }
    }, toolId)
    assert(!r.error, r.error)
    assert(r.toolOut?.filePath && r.toolOut?.filePath.endsWith('.mp3'), `auto 未落盘 ${JSON.stringify(r.toolOut)}`)
    assert(fs.existsSync(r.toolOut.filePath), 'auto 落盘文件不存在')
    const onDisk = fs.readFileSync(r.toolOut.filePath)
    assert(onDisk.equals(AUDIO_BYTES), 'auto 落盘内容不一致')
    console.log(`   auto 模式 ✓（${r.toolOut.filePath}）`)
  })

  await step('清理：E2E 工作流/资产/工具', async () => {
    const r = await page.evaluate(async ({ defId, toolId, assetIds }) => {
      const wf = window.electronAPI.workflow
      const a = window.electronAPI.assets
      const t = window.electronAPI.tools
      const results = []
      for (const id of assetIds) results.push((await a.delete(id)).success)
      const defs = await wf.listDefinitions({ keyword: 'E2E', page: 1, pageSize: 50 })
      for (const d of (defs.success ? defs.data.items : [])) {
        if (d.name.startsWith('E2E-')) await wf.deleteDefinition(d.id)
      }
      if (defId) await wf.deleteDefinition(defId).catch(() => {})
      await t.deleteCustom(toolId)
      return { assets: results.every(Boolean) }
    }, { defId, toolId, assetIds })
    assert(r.assets, '资产清理失败')
    const left = queryDb(`SELECT COUNT(*) c FROM assets WHERE name LIKE '%E2E%' OR name LIKE '自定义TTS%' OR name LIKE 'Base64音频%'`)
    assert(left[0].c === 0, `残留资产 ${left[0].c}`)
  })

  server.close()
  console.log('\n===== 二进制响应（responseType）E2E 通过 ✅ =====')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
