// 只读：两个「先验概率」节点 + 本空间带答疑/笔记/掌握度记录的概念
const Database = require('better-sqlite3')
const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'
const db = new Database(DB_PATH, { readonly: true })

console.log('=== 先验概率')
for (const n of db
  .prepare("SELECT * FROM dl_concept WHERE project_id=? AND name='先验概率'")
  .all(SPACE))
  console.log(`  id=${n.id} en=${n.en} parent=${n.parent_id} mastery=${n.mastery} created=${n.created_at}`)

console.log('\n=== 带答疑的概念')
for (const r of db
  .prepare('SELECT concept_id, COUNT(*) n FROM dl_question WHERE project_id=? GROUP BY concept_id')
  .all(SPACE))
  console.log(`  ${r.concept_id} → ${r.n} 条`)

console.log('\n=== 带笔记的概念')
for (const r of db
  .prepare('SELECT concept_id, COUNT(*) n FROM dl_note WHERE project_id=? GROUP BY concept_id')
  .all(SPACE))
  console.log(`  ${r.concept_id} → ${r.n} 条`)

console.log('\n=== 掌握度记录')
for (const r of db.prepare('SELECT * FROM dl_mastery_log WHERE project_id=?').all(SPACE))
  console.log(`  concept=${r.concept_id} ${r.from_mastery}→${r.to_mastery} trigger=${r.trigger}`)
db.close()
