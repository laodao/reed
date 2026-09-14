// CDP 触发重处理（默认深度学习 epub；可传 docId 参数）
const http = require('http')
const WebSocket = require('ws')
const DOC_ID = process.argv[2] || '5bf8f597-2042-4966-989e-ce6505851353'

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(JSON.parse(d))) }).on('error', reject)
  })
}
function send(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMsg = (raw) => { const m = JSON.parse(raw.toString()); if (m.id === id) { ws.off('message', onMsg); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result) } }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function main() {
  const targets = await getJson('http://127.0.0.1:9222/json/list')
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.on('open', r))
  let id = 0
  const call = (method, params = {}) => send(ws, ++id, method, params)
  await call('Runtime.enable')
  const ev = async (expr) => {
    const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails.exception?.description))
    return r.result?.value
  }
  console.log('[reprocess] docId =', DOC_ID)
  const t0 = Date.now()
  const r = await ev(`window.electronAPI.knowledgeBase.reprocessDocument('${DOC_ID}')`)
  console.log(`[reprocess] 完成 ${((Date.now() - t0) / 1000).toFixed(1)}s:`, JSON.stringify(r))

  const tree = await ev(`window.electronAPI.knowledgeBase.getChapterTree('${DOC_ID}')`)
  console.log('[chapters] stats:', JSON.stringify(tree?.data?.stats))
  const walk = (nodes, depth = 0, max = 22) => {
    let shown = 0
    for (const n of nodes) {
      if (shown >= max) return
      console.log(`${'  '.repeat(depth)}- [L${n.level}] ${n.title.slice(0, 46)} | ${n.summaryStatus}${n.summary ? ' | ' + n.summary.slice(0, 46).replace(/\n/g, ' ') : ''}`)
      shown++
      if (n.children?.length) shown += walk(n.children, depth + 1, max - shown)
    }
    return shown
  }
  walk(tree?.data?.tree || [])
  ws.close()
  process.exit(0)
}
main().catch((e) => { console.error('[reprocess] 失败:', e.message); process.exit(1) })