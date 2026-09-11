// 评估脚本：golden QA → 真实检索管线（knowledgeBase.search）→ recall@k / NDCG@10
const http = require('http')
const fs = require('fs')
const path = require('path')
const WebSocket = require('ws')

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
}
function send(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMsg = (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.id === id) {
        ws.off('message', onMsg)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function main() {
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'kb-eval-golden.json'), 'utf8'))
  const items = golden.items
  console.log(`[eval] golden 共 ${items.length} 条`)

  const targets = await getJson('http://127.0.0.1:9222/json/list')
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.on('open', r))
  let msgId = 0
  const call = (method, params = {}) => send(ws, ++msgId, method, params)
  await call('Runtime.enable')
  const evaluate = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails.exception?.description))
    return r.result ? r.result.value : null
  }

  const results = []
  for (const item of items) {
    const searchExpr = `window.electronAPI.knowledgeBase.search(${JSON.stringify({
      knowledgeBaseId: item.kbId,
      query: item.query,
      topK: 10,
      threshold: 0,
    })})`
    const resp = await evaluate(searchExpr)
    if (!resp || !resp.success) {
      console.log(`  ${item.id} 检索失败:`, resp && resp.error)
      results.push({ id: item.id, hitRank: -1 })
      continue
    }
    const resultsList = (resp.data || []).filter((r) => r && typeof r.content === 'string')
    // 命中判定：documentId 匹配 + content 含任一 keyword
    let hitRank = -1
    for (let i = 0; i < resultsList.length; i++) {
      const r = resultsList[i]
      const content = r.content
      const matchesKb = r.documentId === item.docId
      if (!matchesKb) continue
      const kwHit = (item.keywords || []).some((k) => content.toLowerCase().includes(k.toLowerCase()))
      if (kwHit) { hitRank = i + 1; break }
    }
    results.push({ id: item.id, hitRank })
    const tag = hitRank === -1 ? 'MISS' : `hit@${hitRank}`
    console.log(`  ${item.id} ${tag} :: ${item.query.slice(0, 50)}`)
  }

  // 汇总
  const hits = results.filter((r) => r.hitRank > 0)
  const total = results.length
  const recallAt = (k) => (hits.filter((r) => r.hitRank <= k).length / total) * 100
  let ndcg10 = 0
  for (const item of items) {
    const r = results.find((x) => x.id === item.id)
    if (!r || r.hitRank < 0) continue
    ndcg10 += 1 / Math.log2(Math.min(r.hitRank, 10) + 1)
  }
  ndcg10 = (ndcg10 / total) * 100
  console.log('\n========== baseline 汇总 ==========')
  console.log(`总条数: ${total} | 命中(MISS=未命中): ${hits.length}/${total}`)
  console.log(`recall@1: ${recallAt(1).toFixed(1)}% | recall@3: ${recallAt(3).toFixed(1)}% | recall@5: ${recallAt(5).toFixed(1)}% | recall@10: ${recallAt(10).toFixed(1)}%`)
  console.log(`NDCG@10: ${ndcg10.toFixed(1)}%`)
  const missIds = results.filter((r) => r.hitRank === -1).map((r) => r.id)
  if (missIds.length) console.log('未命中条目:', missIds.join(', '))

  fs.writeFileSync(path.join(__dirname, 'eval-baseline-result.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    hits: hits.length,
    recallAt1: recallAt(1), recallAt3: recallAt(3), recallAt5: recallAt(5), recallAt10: recallAt(10),
    ndcg10,
    perItem: results,
    missIds,
  }, null, 2))
  console.log('[eval] 结果已存 tests/eval/eval-baseline-result.json')
  ws.close()
  process.exit(0)
}
main().catch((e) => { console.error('[eval] 失败:', e.message); process.exit(1) })