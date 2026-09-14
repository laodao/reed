/**
 * 只读探针：金融理财空间的家底（概念/分组/讲义/关系/答疑/笔记/掌握度/方案）
 * 用法：ELECTRON_RUN_AS_NODE=1 electron progress/_dl_probe_finance_assets.cjs [dbPath]
 */
const Database = require('better-sqlite3')

const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const SPACE = '5d586839-607f-4d57-b8d5-a0b51b276586'

const db = new Database(DB_PATH, { readonly: true })
const one = (sql, ...a) => db.prepare(sql).get(...a)
const all = (sql, ...a) => db.prepare(sql).all(...a)
const hasTable = (t) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)

const p = one('SELECT * FROM dl_project WHERE id=?', SPACE)
console.log('=== 空间')
console.log(`  name=${p.name} goal=${p.goal} status=${p.status} created=${p.created_at}`)
console.log(`  description=${p.description}`)
console.log(`  prerequisites=${p.prerequisites}`)
console.log(`  pace_settings=${p.pace_settings} review_settings=${p.review_settings}`)
console.log(`  kb_id=${p.kb_id} default_model=${p.default_model}`)

console.log('\n=== 节点（dl_concept）')
const nodes = all('SELECT * FROM dl_concept WHERE project_id=? ORDER BY created_at', SPACE)
const byId = new Map(nodes.map((n) => [n.id, n]))
const cards = all('SELECT concept_id, id, version, status, essence_type FROM dl_card WHERE project_id=?', SPACE)
const cardCnt = new Map()
for (const c of cards) cardCnt.set(c.concept_id, (cardCnt.get(c.concept_id) || 0) + 1)
for (const n of nodes) {
  const parent = n.parent_id ? (byId.get(n.parent_id) || {}).name : '(根)'
  console.log(
    `  ${n.node_type === 'group' ? '▸' : ' '} ${n.name}  [${n.node_type}] id=${n.id}`,
  )
  console.log(
    `      parent=${parent} source=${n.source} research=${n.research_state} mastery=${n.mastery} card_id=${n.card_id} 讲义=${cardCnt.get(n.id) || 0}`,
  )
}

const conceptIds = nodes.map((n) => n.id)
const ph = conceptIds.map(() => '?').join(',') || "''"

console.log('\n=== 计数')
const rel = one(
  `SELECT COUNT(*) n FROM dl_relation WHERE project_id=?`,
  SPACE,
).n
const relIn = conceptIds.length
  ? one(
      `SELECT COUNT(*) n FROM dl_relation WHERE project_id=? AND (source_id IN (${ph}) OR target_id IN (${ph}))`,
      SPACE,
      ...conceptIds,
      ...conceptIds,
    ).n
  : 0
console.log(`  关系边 total=${rel} 关联本空间节点=${relIn}`)
console.log(`  讲义卡=${cards.length} 版本明细=${cards.map((c) => `v${c.version}/${c.status}`).join(',') || '(无)'}`)
console.log(`  答疑=${one('SELECT COUNT(*) n FROM dl_question WHERE project_id=?', SPACE).n}`)
console.log(`  笔记=${one('SELECT COUNT(*) n FROM dl_note WHERE project_id=?', SPACE).n}`)
console.log(`  掌握度记录=${one('SELECT COUNT(*) n FROM dl_mastery_log WHERE project_id=?', SPACE).n}`)
if (hasTable('dl_doc')) console.log(`  文档=${one('SELECT COUNT(*) n FROM dl_doc WHERE project_id=?', SPACE).n}`)
if (hasTable('dl_plan')) {
  console.log('  方案 dl_plan:')
  for (const r of all('SELECT * FROM dl_plan WHERE project_id=? ORDER BY created_at', SPACE)) {
    console.log(
      `    step=${r.step} status=${r.status} rev=${r.revision} len(payload)=${(r.payload || '').length} created=${r.created_at}`,
    )
  }
}

console.log('\n=== 其他空间里是否引用本空间节点（跨空间关系）')
for (const r of all(
  `SELECT * FROM dl_relation WHERE source_id IN (${ph}) OR target_id IN (${ph})`,
  ...conceptIds,
  ...conceptIds,
)) {
  if (r.project_id !== SPACE) console.log('  跨空间边:', JSON.stringify(r))
}
db.close()
