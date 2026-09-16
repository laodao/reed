/**
 * 取证: 深度学习两张卡的 essence_type 是否相同(同模板却不同区集)
 * 运行: ELECTRON_RUN_AS_NODE=1 electron progress/_dl_essence_check.cjs
 */
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })
const pid = 'a13eb877-bf6d-4546-bc43-d08fc010367a'
const rows = db
  .prepare('SELECT concept_id, version, essence_type, status, sections FROM dl_card WHERE project_id=? ORDER BY concept_id, version')
  .all(pid)
const concepts = db.prepare('SELECT id,name FROM dl_concept WHERE project_id=?').all(pid)
for (const r of rows) {
  const c = concepts.find((x) => x.id === r.concept_id)
  const secs = JSON.parse(r.sections || '[]')
  console.log(
    `${c ? c.name : r.concept_id} v${r.version} essence=${r.essence_type} status=${r.status} 区数=${secs.length} → ${secs.map((s) => s.key).join('>')}`
  )
}
db.close()
