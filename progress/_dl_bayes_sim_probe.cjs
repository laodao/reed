// 只读调试：对指定概念对实测 内容 Jaccard / 包含度（验证度量是否有效）
const Database = require('better-sqlite3')
const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'
const db = new Database(DB_PATH, { readonly: true })

const names = [
  '贝叶斯统计的公开未决问题',
  '贝叶斯推断中的开放问题',
  '贝叶斯方法论的开放问题',
  '贝叶斯定理：定理已证，未决问题在其方法论层面',
  '变分推断',
  '变分推断（VI）',
  '测度（Measure）',
  '测度（Measure / Probability measure）',
]
const cards = db.prepare('SELECT * FROM dl_card WHERE project_id=?').all(SPACE)
const cardsOf = new Map()
for (const k of cards) {
  if (!cardsOf.has(k.concept_id)) cardsOf.set(k.concept_id, [])
  cardsOf.get(k.concept_id).push(k)
}
function cardText(k) {
  if (!k) return ''
  let s = ''
  try {
    const sec = typeof k.sections === 'string' ? JSON.parse(k.sections) : k.sections
    for (const x of sec || []) s += `${x.title || x.key || ''}\n${x.md || ''}\n`
  } catch {
    s += String(k.sections || '')
  }
  return s + (k.content_md || '')
}
const normText = (raw) =>
  String(raw || '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。、；：""''（）()《》【】\-—_/\\|·・]/g, '')
    .toLowerCase()
const gramsArr = (s, n) => {
  const out = []
  if (s.length <= n) return s ? [s] : []
  for (let i = 0; i + n <= s.length; i++) out.push(s.slice(i, i + n))
  return out
}

const picked = []
for (const nm of names) {
  const c = db.prepare('SELECT * FROM dl_concept WHERE project_id=? AND name=?').get(SPACE, nm)
  if (!c) {
    console.log(`找不到「${nm}」`)
    continue
  }
  const ks = (cardsOf.get(c.id) || []).sort((a, b) => b.version - a.version)
  const cur = c.card_id ? (cardsOf.get(c.id) || []).find((k) => k.id === c.card_id) || ks[0] : ks[0]
  picked.push({ name: nm, id: c.id, def: c.definition_short || '', text: normText(`${c.definition_short || ''}\n${cardText(cur)}`), versions: ks.length })
}

console.log('\n各概念规范化文本长度：')
for (const p of picked) console.log(`  ${p.name}: ${p.text.length} 字（讲义版本 ${p.versions}）`)

console.log('\n两两相似度（4-gram Jaccard / 包含度 |A∩B|/min / 2-gram Jaccard）：')
for (let i = 0; i < picked.length; i++) {
  for (let j = i + 1; j < picked.length; j++) {
    const a = picked[i],
      b = picked[j]
    const g = (s, n) => new Set(gramsArr(s, n))
    const jac = (x, y) => {
      const [s, l] = x.size <= y.size ? [x, y] : [y, x]
      let inter = 0
      for (const v of s) if (l.has(v)) inter++
      return { inter, j: inter / (x.size + y.size - inter), cont: inter / Math.min(x.size, y.size) }
    }
    const g4 = jac(g(a.text, 4), g(b.text, 4))
    const g2 = jac(g(a.text, 2), g(b.text, 2))
    console.log(
      `  ${a.name} ↔ ${b.name}\n     4-gram Jaccard=${g4.j.toFixed(3)} 包含=${g4.cont.toFixed(3)} | 2-gram Jaccard=${g2.j.toFixed(3)} 包含=${g2.cont.toFixed(3)}`,
    )
  }
}
db.close()
