/**
 * 评估对照：严格判定（关键词必须出现在切片正文）vs 章节感知判定（关键词出现在正文或所属章节路径）
 *
 * 为什么需要对照：M3 起检索结果会向 LLM 注入「章节: 路径 › 路径」，因此「命中的内容」不止正文；
 * 而 original 判据只看 content 字面，会把「章节标题已含关键词、正文是具体规则」的正确答案记为未命中。
 * 本脚本同时输出两套指标，避免用单一指标掩盖真实排序变化。
 *
 * 运行：node progress/_eval_section_aware.cjs
 */
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
  const dataset = (process.argv.find(a => a.startsWith('--dataset=')) || '--dataset=golden').split('=')[1]
  const file = dataset === 'keyword' ? 'kb-eval-keyword.json' : 'kb-eval-golden.json'
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'eval', file), 'utf8'))
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

  const strict = []
  const sectionAware = []
  const detail = []
  for (const item of golden.items) {
    const resp = await ev(`window.electronAPI.knowledgeBase.search(${JSON.stringify({
      knowledgeBaseId: item.kbId,
      query: item.query,
      topK: 10,
      threshold: 0,
    })})`)
    const list = resp?.success ? (resp.data || []).filter(r => r && typeof r.content === 'string') : []
    let sRank = -1
    let aRank = -1
    const kws = item.keywords || []
    list.forEach((r, i) => {
      if (r.documentId !== item.docId) return
      const inContent = kws.some(k => r.content.toLowerCase().includes(k.toLowerCase()))
      const inPath = (r.chapterPath || []).join(' ').toLowerCase()
      const inPathHit = kws.some(k => inPath.includes(k.toLowerCase()))
      if (inContent && sRank < 0) sRank = i + 1
      if ((inContent || inPathHit) && aRank < 0) aRank = i + 1
    })
    strict.push(sRank)
    sectionAware.push(aRank)
    detail.push({ id: item.id, strict: sRank, sectionAware: aRank })
    if (sRank !== aRank) console.log(`  ${item.id}: 严格=${sRank < 0 ? 'MISS' : '@' + sRank} 章节感知=${aRank < 0 ? 'MISS' : '@' + aRank}`)
  }

  const metrics = ranks => ({
    recall1: (ranks.filter(r => r === 1).length / ranks.length) * 100,
    recall3: (ranks.filter(r => r > 0 && r <= 3).length / ranks.length) * 100,
    recall10: (ranks.filter(r => r > 0 && r <= 10).length / ranks.length) * 100,
    ndcg10: (ranks.reduce((a, r) => a + (r > 0 ? 1 / Math.log2(Math.min(r, 10) + 1) : 0), 0) / ranks.length) * 100,
  })
  const s = metrics(strict)
  const a = metrics(sectionAware)
  console.log(`\n数据集 ${dataset}（${golden.items.length} 条）`)
  console.log(`严格判定（关键词须在切片正文）      : recall@1=${s.recall1.toFixed(1)}% recall@3=${s.recall3.toFixed(1)}% recall@10=${s.recall10.toFixed(1)}% NDCG@10=${s.ndcg10.toFixed(1)}%`)
  console.log(`章节感知（正文或章节路径含关键词）  : recall@1=${a.recall1.toFixed(1)}% recall@3=${a.recall3.toFixed(1)}% recall@10=${a.recall10.toFixed(1)}% NDCG@10=${a.ndcg10.toFixed(1)}%`)
  fs.writeFileSync(path.join(__dirname, `_eval-section-aware-${dataset}.json`), JSON.stringify({ dataset, strict: s, sectionAware: a, detail }, null, 2))
  ws.close()
  process.exit(0)
}
main().catch(e => {
  console.error('[eval] 失败:', e.message)
  process.exit(1)
})
