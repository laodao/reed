/**
 * 只读分析 v2：贝叶斯空间重复知识点「成对证据」分层报告（不做并查集聚类，避免把相关概念串成簇）
 *
 * 分层：
 *  T1 名称规范化后完全相同（去括号补充/空白/大小写/全半角/标点）—— 同义同名，最可靠
 *  T2 名称高度相似（去括号后 bigram Dice ≥ 0.75）或包含关系
 *  T3 定义完全相同（规范化逐字相同）
 *  T4 内容高度相似（定义+当前讲义 字符4-gram Jaccard ≥ 0.6，MinHash 预估筛选后精确复核）
 *
 * 输出：控制台分层计数 + JSON 明细（含双方定义与当前讲义开头，供人工判定）
 * 用法：ELECTRON_RUN_AS_NODE=1 electron progress/_dl_bayes_dup_pairs.cjs [dbPath]
 */
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'
const NAME_SIM_T2 = 0.75
const CONTENT_T4 = 0.6
const PREFILTER = 0.4
const MINHASH_K = 96
const OUT = path.join(__dirname, '_dl_bayes_dup_pairs.json')

function normName(raw) {
  let s = String(raw || '')
  s = s.replace(/[（(][^（()）]*[)）]/g, '')
  s = s.replace(/[\s\u3000]+/g, '')
  s = s.replace(/[·・:：,，、.。;；'"“”‘’\-—_/\\|]/g, '')
  s = s.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  return s.toLowerCase()
}
function normText(raw) {
  return String(raw || '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。、；：""''（）()《》【】\-—_/\\|·・]/g, '')
    .toLowerCase()
}
function bigrams(s) {
  const out = new Set()
  for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2))
  if (s.length === 1) out.add(s)
  return out
}
function dice(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return (2 * inter) / (a.size + b.size)
}
function grams(s, n = 4) {
  const out = new Set()
  if (s.length <= n) {
    if (s) out.add(s)
    return out
  }
  for (let i = 0; i + n <= s.length; i++) out.add(s.slice(i, i + n))
  return out
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  const [small, big] = a.size <= b.size ? [a, b] : [b, a]
  let inter = 0
  for (const x of small) if (big.has(x)) inter++
  return inter / (a.size + b.size - inter)
}
function fnv(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}
const A = [],
  B = []
{
  let seed = 20260913
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let i = 0; i < MINHASH_K; i++) {
    A.push(1 + Math.floor(rnd() * 0xffffff))
    B.push(Math.floor(rnd() * 0xffffff))
  }
}
function minhash(set) {
  const sig = new Array(MINHASH_K).fill(0xffffffff)
  for (const g of set) {
    const x = fnv(g)
    for (let k = 0; k < MINHASH_K; k++) {
      const h = (Math.imul(A[k], x) + B[k]) >>> 0
      if (h < sig[k]) sig[k] = h
    }
  }
  return sig
}
const sigSim = (s1, s2) => {
  let same = 0
  for (let i = 0; i < MINHASH_K; i++) if (s1[i] === s2[i]) same++
  return same / MINHASH_K
}

const db = new Database(DB_PATH, { readonly: true })
const nodes = db
  .prepare("SELECT * FROM dl_concept WHERE project_id=? AND node_type<>'group' ORDER BY created_at")
  .all(SPACE)
const cards = db.prepare('SELECT * FROM dl_card WHERE project_id=?').all(SPACE)
const rels = db.prepare('SELECT * FROM dl_relation WHERE project_id=?').all(SPACE)
const questions = db.prepare('SELECT * FROM dl_question WHERE project_id=?').all(SPACE)
const notes = db.prepare('SELECT * FROM dl_note WHERE project_id=?').all(SPACE)
const logs = db.prepare('SELECT * FROM dl_mastery_log WHERE project_id=?').all(SPACE)
const allNodes = db.prepare('SELECT id,name,node_type FROM dl_concept WHERE project_id=?').all(SPACE)
const nodeName = new Map(allNodes.map((n) => [n.id, n.name]))
const nodeType = new Map(allNodes.map((n) => [n.id, n.node_type]))

const cardsOf = new Map()
for (const k of cards) {
  if (!cardsOf.has(k.concept_id)) cardsOf.set(k.concept_id, [])
  cardsOf.get(k.concept_id).push(k)
}
function currentCard(c) {
  const ks = cardsOf.get(c.id) || []
  if (c.card_id) {
    const hit = ks.find((k) => k.id === c.card_id)
    if (hit) return hit
  }
  return ks.slice().sort((a, b) => b.version - a.version)[0] || null
}
function cardText(k) {
  if (!k) return ''
  let s = ''
  try {
    const sections = typeof k.sections === 'string' ? JSON.parse(k.sections) : k.sections
    for (const sec of sections || []) s += `${sec.title || sec.key || ''}\n${sec.md || ''}\n`
  } catch {
    s += String(k.sections || '')
  }
  return s + (k.content_md || '')
}
const relCount = new Map()
for (const r of rels) {
  relCount.set(r.source_id, (relCount.get(r.source_id) || 0) + 1)
  relCount.set(r.target_id, (relCount.get(r.target_id) || 0) + 1)
}
const qCount = new Map()
for (const q of questions) if (q.concept_id) qCount.set(q.concept_id, (qCount.get(q.concept_id) || 0) + 1)
const noteCount = new Map()
for (const n of notes) if (n.concept_id) noteCount.set(n.concept_id, (noteCount.get(n.concept_id) || 0) + 1)
const logCount = new Map()
for (const l of logs) logCount.set(l.concept_id, (logCount.get(l.concept_id) || 0) + 1)

const items = nodes.map((c) => {
  const cur = currentCard(c)
  const fullText = cardText(cur)
  const text = normText(`${c.definition_short || ''}\n${fullText}`).slice(0, 8000)
  const gset = grams(text, 4)
  return {
    id: c.id,
    name: c.name,
    en: c.en || '',
    parent: c.parent_id ? `${nodeName.get(c.parent_id) || c.parent_id}${nodeType.get(c.parent_id) !== 'group' ? '（非目录节点）' : ''}` : '根层',
    createdAt: c.created_at,
    research: c.research_state,
    mastery: c.mastery,
    source: c.source,
    cards: (cardsOf.get(c.id) || []).map((k) => `v${k.version}/${k.status}`).join(',') || '无',
    cardLen: fullText.length,
    cardHead: normText(fullText).slice(0, 0) + fullText.slice(0, 320),
    rel: relCount.get(c.id) || 0,
    q: qCount.get(c.id) || 0,
    note: noteCount.get(c.id) || 0,
    log: logCount.get(c.id) || 0,
    def: c.definition_short || '',
    normName: normName(c.name),
    normDef: normText(c.definition_short || ''),
    bg: bigrams(normName(c.name)),
    sig: minhash(gset),
    gset,
    textLen: text.length,
  }
})

const CONTENT_TOP_PREFILTER = 0.2
const t1 = [],
  t2 = [],
  t3 = [],
  t4 = [],
  contentAll = []
for (let i = 0; i < items.length; i++) {
  for (let j = i + 1; j < items.length; j++) {
    const x = items[i],
      y = items[j]
    const pair = (kind, score) => ({ kind, score, a: x.name, b: y.name, ai: x.id, bi: y.id })
    let handled = false
    if (x.normName && x.normName === y.normName) {
      t1.push(pair('名称规范化相同', 1))
      handled = true
    }
    const nd = dice(x.bg, y.bg)
    const contain =
      x.normName.length >= 4 &&
      y.normName.length >= 4 &&
      (x.normName.includes(y.normName) || y.normName.includes(x.normName)) &&
      Math.min(x.normName.length, y.normName.length) / Math.max(x.normName.length, y.normName.length) >= 0.6
    if (!handled && (nd >= NAME_SIM_T2 || contain)) t2.push(pair(contain ? '名称包含' : '名称相似', nd))
    if (x.normDef.length >= 8 && x.normDef === y.normDef) t3.push(pair('定义完全相同', 1))
    const est = sigSim(x.sig, y.sig)
    if (est >= CONTENT_TOP_PREFILTER && x.textLen > 200 && y.textLen > 200) {
      const cs = jaccard(x.gset, y.gset)
      if (cs >= CONTENT_T4) t4.push(pair('内容相似', cs))
      if (cs >= 0.25) contentAll.push(pair('内容相似', cs))
    }
  }
}
for (const arr of [t1, t2, t3, t4, contentAll]) arr.sort((p, q) => q.score - p.score)

fs.writeFileSync(OUT, JSON.stringify({ items, t1, t2, t3, t4, contentTop: contentAll.slice(0, 80) }, null, 2))
console.log(`知识点 ${items.length}`)
console.log(`T1 名称规范化相同：${t1.length} 对，涉及节点 ${new Set(t1.flatMap((p) => [p.ai, p.bi])).size} 个`)
console.log(`T2 名称相似/包含：${t2.length} 对，涉及节点 ${new Set(t2.flatMap((p) => [p.ai, p.bi])).size} 个`)
console.log(`T3 定义完全相同：${t3.length} 对，涉及节点 ${new Set(t3.flatMap((p) => [p.ai, p.bi])).size} 个`)
console.log(`T4 内容相似(≥${CONTENT_T4})：${t4.length} 对，涉及节点 ${new Set(t4.flatMap((p) => [p.ai, p.bi])).size} 个`)
console.log(`内容相似(≥0.25) 共 ${contentAll.length} 对，前 80 已导出`)
console.log('内容相似 Top10：')
for (const p of contentAll.slice(0, 10)) console.log(`  ${p.score.toFixed(3)}  ${p.a}  ↔  ${p.b}`)
console.log(`明细：${OUT}`)
db.close()
