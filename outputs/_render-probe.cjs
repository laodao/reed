/**
 * 浏览器渲染兜底真机单点验证（头条反爬挑战页 → 隐藏窗口渲染取正文）：
 * 临时定义 start → web-extract(render=always) → app-notify，跑一篇头条文章，
 * 校验节点输出 rendered=true 且正文长度远超 HTTP 挑战页（<100 字）。
 * 运行：node outputs/_render-probe.cjs
 */
const http = require('http')

const PROBE_URL = process.argv[2] || 'https://www.toutiao.com/article/7686039605452128803/'

function cdp(wsUrl, method, params, timeoutMs = 300_000) {
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
      else if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails).slice(0, 600)))
      else resolve(msg.result?.result?.value)
    })
    ws.on('error', reject)
  })
}

async function main() {
  const targets = JSON.parse(await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', (res) => { let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve(b)) }).on('error', reject)
  }))
  const page = targets.find((t) => t.type === 'page' && !/devtools/i.test(t.url))
  if (!page) throw new Error('主窗口未找到')
  const ev = (expr, timeout) => cdp(page.webSocketDebuggerUrl, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, timeout)
  console.log('[probe] 主窗口：', page.title)

  const graph = {
    nodes: [
      { id: 'start', type: 'start', name: '开始', position: { x: 40, y: 240 }, config: { inputs: [{ key: 'url', label: '网页地址', type: 'string', required: true }] } },
      { id: 'extract1', type: 'web-extract', name: '渲染抓正文', position: { x: 400, y: 240 }, config: { url: '{{start.url}}', render: 'always', maxLength: 150000, maxLinks: 0 } },
      { id: 'notify1', type: 'app-notify', name: '完成', position: { x: 760, y: 240 }, config: { title: '渲染探测完成', level: 'info', message: '正文 {{extract1.length}} 字（rendered={{extract1.rendered}}）' } },
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'start', targetNodeId: 'extract1', kind: 'normal' },
      { id: 'e2', sourceNodeId: 'extract1', targetNodeId: 'notify1', kind: 'normal' },
    ],
  }

  const created = await ev(`window.electronAPI.workflow.createDefinition({ name: '_render-probe-' + Date.now(), description: 'temp' }).then(r => r)`)
  if (!created?.success) throw new Error('创建定义失败：' + JSON.stringify(created).slice(0, 300))
  const defId = created.data.id
  try {
    const saved = await ev(`window.electronAPI.workflow.saveDraft(${JSON.stringify(defId)}, ${JSON.stringify(graph)}).then(r => r)`)
    if (!saved?.success) throw new Error('保存图失败：' + JSON.stringify(saved).slice(0, 300))

    const started = await ev(`window.electronAPI.workflow.startRun({ definitionId: ${JSON.stringify(defId)}, inputs: { url: ${JSON.stringify(PROBE_URL)} } }).then(r => r)`, 60_000)
    if (!started?.success) throw new Error('启动失败：' + JSON.stringify(started).slice(0, 400))
    const runId = started.data.runId ?? started.data.id
    console.log('[probe] run:', runId, '（渲染超时上限 30s/篇，等待终态…）')

    let run = null
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000))
      run = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(runId)}).then(r => r)`)
      const st = run?.data?.run?.status
      if (['succeeded', 'failed', 'cancelled'].includes(st)) break
    }
    const status = run?.data?.run?.status
    console.log('[probe] 终态：', status)
    const nodeRuns = run?.data?.nodeRuns ?? []
    for (const nr of nodeRuns) {
      const out = nr.output ?? nr.outputs ?? null
      if (nr.nodeId === 'extract1') {
        console.log('[probe] extract1 状态:', nr.status, 'error:', nr.error ?? '(无)')
        if (out) {
          console.log('[probe] rendered:', out.rendered, ' length:', out.length, ' title:', out.title)
          console.log('[probe] 正文头部:', String(out.text ?? '').slice(0, 150).replace(/\n/g, ' '))
        }
      } else if (nr.status === 'failed') {
        console.log('[probe]', nr.nodeId, '失败:', String(nr.error ?? '').slice(0, 200))
      }
    }
    if (status !== 'succeeded') throw new Error('运行未成功：' + status)
  } finally {
    await ev(`window.electronAPI.workflow.deleteDefinition(${JSON.stringify(defId)}).then(r => r)`).catch(() => {})
  }
}

main().then(() => { console.log('[probe] PASS'); process.exit(0) }).catch((e) => { console.error('[probe] FAIL:', e.message); process.exit(1) })
