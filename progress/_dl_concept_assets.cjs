/**
 * 取证: 深度学习空间「张量」「自动微分与反向传播」挂载的全部衍生数据(只读)
 * 运行: ELECTRON_RUN_AS_NODE=1 electron progress/_dl_concept_assets.cjs [dbPath] [spaceId]
 */
const Database = require('better-sqlite3')

const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const SPACE = process.argv[3] || 'a13eb877-bf6d-4546-bc43-d08fc010367a'
const NAMES = ['张量', '自动微分与反向传播']

const db = new Database(DB_PATH, { readonly: true })
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'dl_%'").all().map((t) => t.name)
console.log('[assets] dl_* 表:', tables.join(', '))

const concepts = db.prepare('SELECT * FROM dl_concept WHERE project_id=?').all(SPACE)
const targets = concepts.filter((c) => NAMES.includes(c.name))
console.log('\n[assets] 命中知识点:', targets.map((c) => `${c.name}(id=${c.id})`).join(' | ') || '(无)')

for (const c of targets) {
  console.log(`\n===== ${c.name} (id=${c.id}) =====`)
  console.log(`  node_type=${c.node_type} research_state=${c.research_state} mastery=${c.mastery} card_id=${c.card_id} source=${c.source}`)
  const cards = db.prepare('SELECT id,version,status,essence_type,length(sections) AS sec_len,created_at,updated_at FROM dl_card WHERE concept_id=? ORDER BY version').all(c.id)
  console.log(`  讲义卡 ${cards.length} 张:`)
  for (const k of cards) console.log(`    v${k.version} ${k.status} ${k.essence_type} sections=${k.sec_len}B created=${k.created_at} updated=${k.updated_at} id=${k.id}`)
  for (const t of ['dl_question', 'dl_note', 'dl_mastery_log', 'dl_doc']) {
    if (!tables.includes(t)) continue
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((x) => x.name)
    if (!cols.includes('concept_id')) {
      console.log(`  ${t}: (无 concept_id 列，跳过)`)
      continue
    }
    const rows = db.prepare(`SELECT * FROM ${t} WHERE concept_id=?`).all(c.id)
    console.log(`  ${t}: ${rows.length} 行`)
    if (rows.length) {
      for (const r of rows.slice(0, 6)) {
        const brief = r.question || r.title || r.content_md || r.note || r.kind || JSON.stringify(r).slice(0, 120)
        console.log(`    - ${String(brief).replace(/\s+/g, ' ').slice(0, 140)}`)
      }
      if (rows.length > 6) console.log(`    … 其余 ${rows.length - 6} 行`)
    }
  }
  const rels = db.prepare('SELECT * FROM dl_relation WHERE project_id=? AND (source_id=? OR target_id=?)').all(SPACE, c.id, c.id)
  console.log(`  关系边 ${rels.length} 条:`)
  for (const r of rels) {
    const s = concepts.find((x) => x.id === r.source_id)
    const t = concepts.find((x) => x.id === r.target_id)
    console.log(`    ${s ? s.name : r.source_id} → ${t ? t.name : r.target_id} (${r.relation_type}, verified=${r.verified})`)
  }
  const children = concepts.filter((x) => x.parent_id === c.id)
  if (children.length) console.log(`  子节点 ${children.length}: ${children.map((x) => x.name).join(', ')}`)
}

// 其他表里可能引用 card_id 的
const cardIds = db.prepare('SELECT id FROM dl_card WHERE concept_id IN (?,?)').all(...targets.map((c) => c.id)).map((r) => r.id)
console.log('\n[assets] 目标卡 id:', cardIds.join(', ') || '(无)')
for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
  if (!cols.includes('card_id')) continue
  for (const id of cardIds) {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE card_id=?`).get(id).n
    if (n) console.log(`  ${t}.card_id=${id}: ${n} 行`)
  }
}
db.close()
