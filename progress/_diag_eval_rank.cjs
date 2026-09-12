// 诊断：评估集里掉到 rank2 的条目，看 top3 到底是「同章节相邻切片」还是「别的文档」
// 运行：node progress/_diag_eval_rank.cjs
const http = require('http')
const fs = require('fs')
const path = require('path')
const WebSocket = require('ws')

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = ''
      res.on('data', c => (d += c))
      res.on('end', () => resolve(JSON.parse(d)))
    }).on('error', reject)
  })
}
function send(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMsg = raw => {
      const m = JSON.parse(raw.toString())
      if (m.id === id) {
        ws.off('message', onMsg)
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
      }
    }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function main() {
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'eval', 'kb-eval-golden.json'), 'utf8'))
  const result = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'eval', 'eval-baseline-result.json'), 'utf8'))
  const targets = await getJson('http://127.0.0.1:9222/json/list')
  const page = targets.find(t => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise(r => ws.on('open', r))
  let id = 0
  const call = (m, p = {}) => send(ws, ++id, m, p)
  await call('Runtime.enable')
  const ev = async expr => {
    const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description))
    return r.result?.value
  }

  const targets2 = result.perItem.filter(x => x.hitRank !== 1)
  for (const t of targets2) {
    const item = golden.items.find(i => i.id === t.id)
    console.log(`\n=== ${item.id} (期望 docId=${item.docId.slice(0, 8)} keywords=${item.keywords.join('/')}) @rank${t.hitRank}`)
    console.log(`query: ${item.query}`)
    const resp = await ev(`window.electronAPI.knowledgeBase.search(${JSON.stringify({
      knowledgeBaseId: item.kbId,
      query: item.query,
      topK: 5,
      threshold: 0,
    })})`)
    if (!resp?.success) {
      console.log('  检索失败:', resp?.error)
      continue
    }
    resp.data.slice(0, 5).forEach((r, i) => {
      const sameDoc = r.documentId === item.docId
      const kw = (item.keywords || []).some(k => (r.content || '').toLowerCase().includes(k.toLowerCase()))
      console.log(
        `  ${i + 1}. ${sameDoc ? '同文档' : '其他文档doc=' + String(r.documentId).slice(0, 8)} | score=${(r.score ?? 0).toFixed(3)} | kw=${kw ? '有' : '无'}` +
          ` | 章节=${(r.chapterPath || []).join(' › ') || '-'}\n     ${String(r.content || '').replace(/\s+/g, ' ').slice(0, 110)}`,
      )
    })
  }
  ws.close()
  process.exit(0)
}
main().catch(e => {
  console.error('失败:', e.message)
  process.exit(1)
})
