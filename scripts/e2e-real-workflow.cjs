/**
 * E2E 真实业务测试 #5：工作流真实产出资产
 * 图：start(主题输入) → llm-chat(真实 deepseek 文本生成) → save-asset(落资产库) → end
 * 验证：run succeeded + llm 节点输出真实内容 + assets 表落库 + 资产内容是 AI 真实产出
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const path = require('path')
const os = require('os')
const DB = path.join(os.homedir(), '.config/the_bot/the_bot.db')

const PC = 'pc_mtee10tz_ijz2yq1ro'
const MODEL = 'deepseek-v4-flash-0731'
const TOPIC = '旧书店里的猫'

function q(sql) {
  const out = execSync(`sqlite3 -json "${DB}" "${sql}"`, { encoding: 'utf8' }).trim()
  return out ? JSON.parse(out) : []
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')
  const fail = (m) => { console.error('❌', m); process.exit(1) }

  // 建 + 发布工作流
  const defId = await page.evaluate(async ({ pc, model }) => {
    const wf = window.electronAPI.workflow
    const c = await wf.createDefinition({ name: `E2E真实-工作流产出-${Date.now().toString(36)}`, description: 'llm-chat 真实生成 → save-asset 落库' })
    if (!c.success) return { error: JSON.stringify(c.error) }
    const graph = {
      version: 1,
      nodes: [
        { id: 'start', type: 'start', name: '开始', position: { x: 40, y: 160 }, config: { inputs: [{ key: 'topic', label: '主题', type: 'string' }] } },
        { id: 'llm', type: 'llm-chat', name: 'AI 写微小说', position: { x: 260, y: 160 }, config: {
          providerConfigId: pc, modelId: model,
          systemPrompt: '你是微小说作家。根据用户主题写一段 120 字以内的微小说开头，直接输出正文。',
          prompt: '主题：{{start.topic}}', maxTokens: 400, temperature: 0.8,
        } },
        { id: 'save', type: 'save-asset', name: '落资产', position: { x: 480, y: 160 }, config: {
          content: '{{llm.content}}', kind: 'text', category: 'text',
          name: 'E2E真实-微小说-{{start.topic}}', tags: 'e2e,真实产出',
        } },
        { id: 'end', type: 'end', name: '结束', position: { x: 700, y: 160 }, config: {} },
      ],
      edges: [
        { id: 'e0', sourceNodeId: 'start', targetNodeId: 'llm', kind: 'normal' },
        { id: 'e1', sourceNodeId: 'llm', targetNodeId: 'save', kind: 'normal' },
        { id: 'e2', sourceNodeId: 'save', targetNodeId: 'end', kind: 'normal' },
      ],
    }
    const s = await wf.saveDraft(c.data.id, graph)
    if (!s.success) return { error: 'saveDraft: ' + JSON.stringify(s.error) }
    const p = await wf.publishDefinition({ id: c.data.id })
    if (!p.success) return { error: 'publish: ' + JSON.stringify(p.error) }
    return { id: c.data.id }
  }, { pc: PC, model: MODEL })
  if (!defId.id) fail('建工作流: ' + defId.error)
  console.log('工作流:', defId.id)

  // 运行
  const run = await page.evaluate(async ({ defId, topic }) => {
    const wf = window.electronAPI.workflow
    const started = await wf.startRun({ definitionId: defId, inputs: { topic } })
    if (!started.success) return { error: JSON.stringify(started.error) }
    const runId = started.data.id
    for (let i = 0; i < 200; i++) {
      await new Promise(r => setTimeout(r, 1000))
      const r0 = await wf.getRun(runId)
      const status = r0.success && (r0.data?.run?.status ?? r0.data?.status)
      if (status === 'succeeded') return { runId, status }
      if (status === 'failed' || status === 'cancelled') return { runId, status, error: r0.data?.run?.error || r0.data?.error }
    }
    return { runId, error: '运行超时(200s)' }
  }, { defId: defId.id, topic: TOPIC })
  if (run.status !== 'succeeded') fail('运行: ' + JSON.stringify(run))
  console.log('✅ 运行成功:', run.runId)

  // 节点输出 + 资产落库验证
  const llmRows = q(`SELECT output_json FROM workflow_node_runs WHERE run_id='${run.runId}' AND node_id='llm'`)
  const saveRows = q(`SELECT output_json FROM workflow_node_runs WHERE run_id='${run.runId}' AND node_id='save'`)
  if (!llmRows.length || !saveRows.length) fail('节点运行记录缺失')
  const llmOut = JSON.parse(llmRows[0].output_json || '{}')
  const saveOut = JSON.parse(saveRows[0].output_json || '{}')
  const content = String(llmOut.content || '')
  console.log(`llm 输出 ${content.length} 字: ${content.slice(0, 80).replace(/\n/g, ' ')}...`)
  if (content.length < 50) fail('llm 输出过短/为空')
  if (!saveOut.assetId) fail('save-asset 未产出 assetId: ' + JSON.stringify(saveOut))

  const assets = q(`SELECT id, name, kind, category, length(text_content) AS len, substr(text_content,1,80) AS head, source_type FROM assets WHERE id='${saveOut.assetId}'`)
  if (!assets.length) fail('资产未落库')
  const a = assets[0]
  console.log(`资产: id=${a.id} name=${a.name} kind=${a.kind} len=${a.len} source=${a.source_type}`)
  console.log('  内容:', a.head)
  const contentMatch = a.len >= 50
  console.log(contentMatch ? '✅ 工作流真实产出资产通过' : '❌ 资产内容异常')
  console.log('WORKFLOW_RESULT=' + JSON.stringify({ definitionId: defId.id, runId: run.runId, assetId: a.id, contentLen: a.len, usage: llmOut.usage || null }))
  await browser.close()
  if (!contentMatch) process.exit(1)
})().catch(e => { console.error('脚本失败:', e.message); process.exit(1) })
