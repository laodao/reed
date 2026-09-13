/* 定位孤儿关系/孤儿卡的明细(只读) */
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })
const pid = process.argv[2] || '62810aa7-fe29-495f-b2a4-11e6a243b42c'

const concepts = db.prepare('SELECT id,name,node_type FROM dl_concept WHERE project_id=?').all(pid)
const cids = new Set(concepts.map((c) => c.id))
const rels = db.prepare('SELECT id,source_id,target_id,relation_type,created_at FROM dl_relation WHERE project_id=?').all(pid)
const cards = db.prepare('SELECT id,concept_id,essence_type,status,created_at FROM dl_card WHERE project_id=?').all(pid)
const qs = db.prepare('SELECT id,concept_id,question,status FROM dl_question WHERE project_id=?').all(pid)
const notes = db.prepare('SELECT id,concept_id FROM dl_note WHERE project_id=?').all(pid)
const logs = db.prepare('SELECT id,concept_id FROM dl_mastery_log WHERE project_id=?').all(pid)

const nameOf = (id) => {
  const c = concepts.find((x) => x.id === id)
  return c ? `${c.name}(${c.node_type})` : `<不存在:${id}>`
}
console.log('存在概念:', concepts.length)
for (const r of rels.filter((r) => !cids.has(r.source_id) || !cids.has(r.target_id))) {
  console.log(`孤儿关系 ${r.id.slice(0, 8)} ${nameOf(r.source_id)} -> ${nameOf(r.target_id)} (${r.relation_type}) ${r.created_at}`)
}
for (const c of cards.filter((c) => !cids.has(c.concept_id))) {
  console.log(`孤儿卡 ${c.id.slice(0, 8)} concept=<不存在:${c.concept_id}> type=${c.essence_type} status=${c.status} ${c.created_at}`)
}
for (const q of qs.filter((q) => q.concept_id && !cids.has(q.concept_id))) {
  console.log(`孤儿问答 ${q.id.slice(0, 8)} concept=<不存在:${q.concept_id}> q=${q.question.slice(0, 30)}`)
}
for (const n of notes.filter((n) => n.concept_id && !cids.has(n.concept_id))) {
  console.log(`孤儿笔记 ${n.id.slice(0, 8)} concept=<不存在:${n.concept_id}>`)
}
for (const l of logs.filter((l) => l.concept_id && !cids.has(l.concept_id))) {
  console.log(`孤儿掌握记录 ${l.id.slice(0, 8)} concept=<不存在:${l.concept_id}>`)
}
db.close()
