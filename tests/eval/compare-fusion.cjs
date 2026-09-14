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
  // 数据集可选：golden（语义型问句，默认） / keyword（关键词型查询子集）
  const datasetArg = process.argv.find((a) => a.startsWith('--dataset='))
  const dataset = datasetArg ? datasetArg.split('=')[1] : 'golden'
  const goldenFile = dataset === 'keyword' ? 'kb-eval-keyword.json' : 'kb-eval-golden.json'
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, goldenFile), 'utf8'))
  const items = golden.items
  console.log(`[eval] 数据集: ${dataset}（${goldenFile}），共 ${items.length} 条`)

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

  // 权重扫参：纯向量 / 折中权重（0.8、0.7）/ 混合（0.5）/ RRF
  // 目的：语义型问句与关键词型查询的最优策略相反，需找双赢或低损的默认权重
  const strategies = [
    { label: 'vector-only (w=1.0)', fusion: 'weighted', vectorWeight: 1 },
    { label: 'hybrid (w=0.8)', fusion: 'weighted', vectorWeight: 0.8 },
    { label: 'hybrid (w=0.7)', fusion: 'weighted', vectorWeight: 0.7 },
    { label: 'hybrid (w=0.5)', fusion: 'weighted', vectorWeight: 0.5 },
    { label: 'hybrid-rrf (w=0.5)', fusion: 'rrf', vectorWeight: 0.5 },
    { label: 'auto-route (M5+)', auto: true },
  ]
  // --only=auto-route 之类：只跑指定策略（调试/回归省检索次数）
  const onlyArg = process.argv.find((a) => a.startsWith('--only='))
  const only = onlyArg ? onlyArg.split('=')[1] : null
  const activeStrategies = only
    ? strategies.filter((s) => s.label.startsWith(only) || (only === 'auto' && s.auto))
    : strategies
  const result = {}

  for (const s of activeStrategies) {
    const ranks = []
    for (const item of items) {
      const payload = {
        knowledgeBaseId: item.kbId,
        query: item.query,
        topK: 10,
        threshold: 0,
        ...(s.auto ? { autoRoute: true } : { fusion: s.fusion, vectorWeight: s.vectorWeight }),
      }
      const resp = await evaluate(
        `window.electronAPI.knowledgeBase.search(${JSON.stringify(payload)})`,
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

  // 逐条差异（混合加权 w=0.5 vs RRF w=0.5；仅在两者都跑时计算）
  const diff = []
  const w05 = result['hybrid (w=0.5)']
  const rrf05 = result['hybrid-rrf (w=0.5)']
  if (w05 && rrf05) {
    for (let i = 0; i < items.length; i++) {
      const a = w05.ranks[i]
      const b = rrf05.ranks[i]
      if (a !== b) diff.push(`${items[i].id}: hybrid-w0.5=${a} → rrf=${b}`)
    }
    console.log(`\n混合(w=0.5) vs RRF 排序差异条目数: ${diff.length}/${items.length}`)
    diff.slice(0, 12).forEach((d) => console.log('  ' + d))
  }

  const outPath = path.join(__dirname, `fusion-ab-result-${dataset}.json`)
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dataset,
        total: items.length,
        vectorOnly: result['vector-only (w=1.0)']?.metrics ?? null,
        hybridW08: result['hybrid (w=0.8)']?.metrics ?? null,
        hybridW07: result['hybrid (w=0.7)']?.metrics ?? null,
        hybridW05: result['hybrid (w=0.5)']?.metrics ?? null,
        hybridRrf: result['hybrid-rrf (w=0.5)']?.metrics ?? null,
        autoRoute: result['auto-route (M5+)']?.metrics ?? null,
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