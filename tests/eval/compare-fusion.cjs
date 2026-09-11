/**
 * M4 融合策略 A/B：weighted（默认归一化加权） vs rrf（名次倒数融合）
 * 用 tests/eval/kb-eval-golden.json 的 golden 集，走真实检索管线（CDP→knowledgeBase.search）
 * 指标：recall@k、NDCG@10、MRR（都基于「文档匹配 + 关键词命中」判定）。
 *
 * 用法：node tests/eval/compare-fusion.cjs   （需 dev:debug 运行，CDP 9222）
 */
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

/** 对一组 hitRank（1-based，-1=未命中）计算指标 */
function metrics(ranks) {
  const total = ranks.length
  const hit = (k) => ranks.filter((r) => r > 0 && r <= k).length / total
  const ndcg = ranks.reduce((acc, r) => acc + (r > 0 ? 1 / Math.log2(Math.min(r, 10) + 1) : 0), 0) / total
  const mrr = ranks.reduce((acc, r) => acc + (r > 0 ? 1 / r : 0), 0) / total
  return { recall1: hit(1), recall3: hit(3), recall5: hit(5), recall10: hit(10), ndcg10: ndcg, mrr }
}

async function main() {
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'kb-eval-golden.json'), 'utf8'))
  const items = golden.items

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

  // 三组对照：纯向量（默认） / 混合-加权 / 混合-RRF
  // 注意：vectorWeight 缺省为 1（纯向量），此时 BM25 不参与、融合策略无差异；
  // 混合策略的价值必须在 vectorWeight < 1 时才体现。
  const strategies = [
    { label: 'vector-only (w=1.0, weighted)', fusion: 'weighted', vectorWeight: 1 },
    { label: 'hybrid-weighted (w=0.5)', fusion: 'weighted', vectorWeight: 0.5 },
    { label: 'hybrid-rrf (w=0.5)', fusion: 'rrf', vectorWeight: 0.5 },
  ]
  const result = {}

  for (const s of strategies) {
    const ranks = []
    for (const item of items) {
      const resp = await evaluate(
        `window.electronAPI.knowledgeBase.search(${JSON.stringify({
          knowledgeBaseId: item.kbId,
          query: item.query,
          topK: 10,
          threshold: 0,
          fusion: s.fusion,
          vectorWeight: s.vectorWeight,
        })})`,
      )
      let hitRank = -1
      if (resp?.success) {
        const list = (resp.data || []).filter((r) => r && typeof r.content === 'string')
        for (let i = 0; i < list.length; i++) {
          const r = list[i]
          if (r.documentId !== item.docId) continue
          if ((item.keywords || []).some((k) => r.content.toLowerCase().includes(k.toLowerCase()))) {
            hitRank = i + 1
            break
          }
        }
      }
      ranks.push(hitRank)
    }
    result[s.label] = { ranks, metrics: metrics(ranks) }
    const m = result[s.label].metrics
    console.log(
      `[${s.label}] recall@1=${(m.recall1 * 100).toFixed(1)}% recall@3=${(m.recall3 * 100).toFixed(1)}% ` +
        `recall@10=${(m.recall10 * 100).toFixed(1)}% NDCG@10=${(m.ndcg10 * 100).toFixed(1)}% MRR=${(m.mrr * 100).toFixed(1)}%`,
    )
  }

  // 逐条差异（混合加权 vs 混合 RRF）
  const diff = []
  for (let i = 0; i < items.length; i++) {
    const a = result['hybrid-weighted (w=0.5)'].ranks[i]
    const b = result['hybrid-rrf (w=0.5)'].ranks[i]
    if (a !== b) diff.push(`${items[i].id}: hybrid-weighted=${a} → hybrid-rrf=${b}`)
  }
  console.log(`\n混合两策略排序差异条目数: ${diff.length}/${items.length}`)
  diff.slice(0, 12).forEach((d) => console.log('  ' + d))

  const outPath = path.join(__dirname, 'fusion-ab-result.json')
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total: items.length,
        vectorOnly: result['vector-only (w=1.0, weighted)'].metrics,
        hybridWeighted: result['hybrid-weighted (w=0.5)'].metrics,
        hybridRrf: result['hybrid-rrf (w=0.5)'].metrics,
        diff,
      },
      null,
      2,
    ),
  )
  console.log(`\n结果已存 ${outPath}`)
  ws.close()
  process.exit(0)
}
main().catch((e) => {
  console.error('[fusion-ab] 失败:', e.message)
  process.exit(1)
})