/**
 * 取证: 契约上线后新落的讲义卡是否按模板落地(只读)
 * 运行: ELECTRON_RUN_AS_NODE=1 electron progress/_dl_recent_cards.cjs [sinceIsoLike]
 */
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })
const since = process.argv[2] || '2026-09-13 22:40'
const rows = db
  .prepare('SELECT project_id, concept_id, version, essence_type, status, sections, created_at FROM dl_card WHERE created_at >= ? ORDER BY created_at')
  .all(since)
const projects = db.prepare('SELECT id,name FROM dl_project').all()
const concepts = db.prepare('SELECT id,name FROM dl_concept').all()
console.log(`[recent] since=${since} 卡数=${rows.length}`)
for (const r of rows) {
  const p = projects.find((x) => x.id === r.project_id)
  const c = concepts.find((x) => x.id === r.concept_id)
  const secs = JSON.parse(r.sections || '[]')
  console.log(
    `\n${r.created_at} | 空间=${p ? p.name : r.project_id} | 概念=${c ? c.name : r.concept_id} | ${r.essence_type} v${r.version} ${r.status}\n  区序: ${secs.map((s) => s.key).join('>')}\n  标题: ${secs.map((s) => s.title).join(' / ')}`
  )
}
db.close()
