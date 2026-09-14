// 只读甄别：处理前后的悬挂边差异、掌握度记录指向、残留同名组
const Database = require('better-sqlite3')
const LIVE = 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const BAK = 'C:\\Users\\daoge\\the-bot\\the_bot.db.bak-dedupeBayes-2026-09-13-17-45-28'
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

for (const [tag, p] of [
  ['处理前快照', BAK],
  ['处理后实时', LIVE],
]) {
  const db = new Database(p, { readonly: true })
  console.log(`\n===== ${tag}`)
  console.log('-- 悬挂关系边（端点不是有效节点 id）')
  for (const r of db
    .prepare(
      `SELECT r.* FROM dl_relation r
       WHERE r.project_id=?
         AND (NOT EXISTS (SELECT 1 FROM dl_concept c WHERE c.id=r.source_id)
           OR NOT EXISTS (SELECT 1 FROM dl_concept c WHERE c.id=r.target_id))`,
    )
    .all(SPACE))
    console.log(`   ${r.source_id} → ${r.target_id} (${r.relation_type}) verified=${r.verified}`)
  console.log('-- 掌握度记录指向的节点')
  for (const l of db.prepare('SELECT * FROM dl_mastery_log WHERE project_id=?').all(SPACE)) {
    const n = db.prepare('SELECT name FROM dl_concept WHERE id=?').get(l.concept_id)
    console.log(`   ${l.concept_id} → ${n ? n.name : '(节点不存在)'} ${l.from_mastery}→${l.to_mastery}`)
  }
  db.close()
}
