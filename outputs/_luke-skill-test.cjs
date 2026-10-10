/**
 * 「卢克文」技能执行面测试（交付物验证）：system=技能包全文（SKILL.md+frameworks+decision-rules，
 * 与 skill-call 执行时同口径），user=语料外真实任务（土耳其 TB2 无人机），考察蒸馏出的方法论
 * 是否可迁移复现：多势力因果链 / 产业链分层拆解与任务反推 / 通俗化类比 / 诚实边界（不编数字）。
 * 运行：node outputs/_luke-skill-test.cjs
 */
const http = require('http')
const fs = require('fs')

const SKILL_DIR = 'C:/Users/daoge/the-bot/skills/distilled-mv14ggk0'
const TASK = '土耳其的 TB2 无人机为什么能在俄乌战争初期打出名声？后来又被怎么克制的？请按技能里的方法给出结构化分析。'

function cdp(wsUrl, method, params, timeoutMs = 600_000) {
  const WebSocket = require('ws')
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false })
    const id = Math.floor(Math.random() * 1e9)
    const timer = setTimeout(() => { ws.close(); reject(new Error('CDP 超时: ' + method)) }, timeoutMs)
    ws.on('open', () => ws.send(JSON.stringify({ id, method, params })))
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.id !== id) return
      clearTimeout(timer); ws.close()
      if (msg.error) reject(new Error(msg.error.message))
      else if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails).slice(0, 500)))
      else resolve(msg.result?.result?.value)
    })
    ws.on('error', reject)
  })
}

function jstr(s) { return JSON.stringify(s) }

async function main() {
  const targets = JSON.parse(await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', (res) => { let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve(b)) }).on('error', reject)
  }))
  const page = targets.find((t) => t.type === 'page' && !/devtools/i.test(t.url))
  const ev = (expr, timeout) => cdp(page.webSocketDebuggerUrl, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, timeout)
  console.log('[skill-test] 主窗口：', page.title)

  const skillPack = [
    fs.readFileSync(`${SKILL_DIR}/SKILL.md`, 'utf-8'),
    fs.readFileSync(`${SKILL_DIR}/references/frameworks.md`, 'utf-8'),
    fs.readFileSync(`${SKILL_DIR}/references/decision-rules.md`, 'utf-8'),
  ].join('\n\n---\n\n')
  console.log('[skill-test] 技能包字节数：', Buffer.byteLength(skillPack))

  // 模型选择与验收脚本同源
  const provs = await ev(`window.electronAPI.providerConfig.list().then(r => r)`)
  let providerConfigId = null, modelId = null
  for (const pc of (provs?.data?.configs ?? provs?.data ?? [])) {
    const m = (pc.models ?? pc.modelIds ?? []).find?.((x) => x) ?? null
    if (pc.enabled !== false && m) { providerConfigId = pc.id; modelId = typeof m === 'string' ? m : (m.id ?? m.modelId); break }
    if (pc.enabled !== false && !m && pc.defaultModel) { providerConfigId = pc.id; modelId = pc.defaultModel; break }
  }
  console.log('[skill-test] 模型：', providerConfigId, modelId)

  const graph = {
    nodes: [
      { id: 'start', type: 'start', name: '开始', position: { x: 40, y: 240 }, config: { inputs: [
        { key: 'task', label: '任务', type: 'textarea', required: true },
        { key: 'skillPack', label: '技能包', type: 'textarea', required: true },
      ] } },
      { id: 'chat1', type: 'llm-chat', name: '按技能执行', position: { x: 400, y: 240 }, config: {
        prompt: '{{start.task}}',
        systemPrompt: '你要严格按下面这份技能包的方法与纪律执行用户任务。技能包：\n\n{{start.skillPack}}',
        maxTokens: 8000,
        providerConfigId, modelId,
      } },
      { id: 'notify1', type: 'app-notify', name: '完成', position: { x: 760, y: 240 }, config: { title: '技能执行完成', level: 'info', message: '输出 {{chat1.length}} 字' } },
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'start', targetNodeId: 'chat1', kind: 'normal' },
      { id: 'e2', sourceNodeId: 'chat1', targetNodeId: 'notify1', kind: 'normal' },
    ],
  }

  const created = await ev(`window.electronAPI.workflow.createDefinition({ name: '_skill-test-' + Date.now(), description: 'temp' }).then(r => r)`)
  if (!created?.success) throw new Error('创建定义失败：' + JSON.stringify(created).slice(0, 200))
  const defId = created.data.id
  try {
    const saved = await ev(`window.electronAPI.workflow.saveDraft(${jstr(defId)}, ${jstr(graph)}).then(r => r)`)
    if (!saved?.success) throw new Error('保存图失败：' + JSON.stringify(saved).slice(0, 300))
    const started = await ev(`window.electronAPI.workflow.startRun({ definitionId: ${jstr(defId)}, inputs: { task: ${jstr(TASK)}, skillPack: ${jstr(skillPack)} } }).then(r => r)`, 60_000)
    if (!started?.success) throw new Error('启动失败：' + JSON.stringify(started).slice(0, 300))
    const runId = started.data.runId ?? started.data.id
    console.log('[skill-test] run:', runId)

    let run = null
    const t0 = Date.now()
    while (Date.now() - t0 < 10 * 60_000) {
      await new Promise(r => setTimeout(r, 10_000))
      run = (await ev(`window.electronAPI.workflow.getRun(${jstr(runId)}).then(r => r)`))?.data
      const st = run?.run?.status ?? run?.status
      process.stdout.write(`[skill-test] ${Math.round((Date.now() - t0) / 1000)}s ${st}\n`)
      if (st && !['running', 'pending', 'waiting_review'].includes(st)) break
    }
    const status = run?.run?.status ?? run?.status
    if (status !== 'succeeded') throw new Error('运行未成功：' + status + ' ' + JSON.stringify(run).slice(0, 600))

    // 取 chat1 输出
    const out = await ev(`window.electronAPI.workflow.getRun(${jstr(runId)}).then(r => r)`)
    const nodeRun = (out?.data?.nodeRuns ?? []).find(n => n.nodeId === 'chat1')
    const content = nodeRun?.output?.content ?? nodeRun?.outputs?.content ?? ''
    fs.writeFileSync('outputs/_luke-skill-test-output.md', content, 'utf-8')
    console.log('[skill-test] chat1 输出', content.length, '字，已存 outputs/_luke-skill-test-output.md')
    console.log('--- 输出前 2500 字 ---\n' + content.slice(0, 2500))
  } finally {
    await ev(`window.electronAPI.workflow.deleteDefinition(${jstr(defId)}).then(r => r)`).catch(() => {})
  }
}

main().then(() => { console.log('[skill-test] PASS'); process.exit(0) }).catch((e) => { console.error('[skill-test] FAIL:', e.message); process.exit(1) })
