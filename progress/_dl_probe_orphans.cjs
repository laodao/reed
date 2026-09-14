/**
 * 只读甄别：悬挂关系边 / 孤儿讲义卡 到底是谁的、是不是本次清理造成的
 * 用法：ELECTRON_RUN_AS_NODE=1 electron progress/_dl_probe_orphans.cjs <dbPath>
 */
const Database = require('better-sqlite3')
const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const FIN_NODES = [
  'b93b27d8-20d7-4aac-863e-781d24f07e19',
  '6e21c33b-8d98-4103-8705-083575bbccf2',
  'd4878564-06e9-4da9-9e7e-a536bb889029',
  '8d65c356-fe2a-44d0-8bef-b537a8d370d3',
  '86702610-f1b6-4365-81c7-5c0d4937bc3b',
  '20ef818f-e222-44c7-a445-cb3621633552',
  'cca0820f-f106-42ac-a3f1-abf412bdef86',
  '88326170-3447-451f-bf11-c66e338283d7',
  'a0c421a4-933e-46c2-bafe-4cca6528ef1f',
  '8b6ef8a6-c254-4753-9976-8fd15269236c',
  '1e2d9b39-0f5d-44a8-80b8-ed7399c5820f',
  '7e4a2b58-6a5c-4faf-ba19-c6c0c8ee009c',
  '4c03f381-11cd-4a0f-948d-e01cc87fddcf',
]

const db = new Database(DB_PATH, { readonly: true })
const spaceName = (id) => {
  const r = db.prepare('SELECT name FROM dl_project WHERE id=?').get(id)
  return r ? r.name : `(未知空间 ${id})`
}

console.log(`===== ${DB_PATH}`)
console.log('\n-- 悬挂关系边（source/target 在 dl_concept 里不存在）')
for (const r of db
  .prepare(
    `SELECT r.* FROM dl_relation r
     WHERE NOT EXISTS (SELECT 1 FROM dl_concept c WHERE c.id = r.source_id)
        OR NOT EXISTS (SELECT 1 FROM dl_concept c WHERE c.id = r.target_id)`,
  )
  .all()) {
  const fin = FIN_NODES.includes(r.source_id) || FIN_NODES.includes(r.target_id)
  console.log(
    `  space=${spaceName(r.project_id)} type=${r.relation_type} created=${r.created_at} 涉及金融理财已删节点=${fin ? '是！' : '否'}`,
  )
  console.log(`     source=${r.source_id}  target=${r.target_id}`)
}

console.log('\n-- 孤儿讲义卡（concept_id 在 dl_concept 里不存在）')
for (const k of db
  .prepare(
    'SELECT k.* FROM dl_card k WHERE NOT EXISTS (SELECT 1 FROM dl_concept c WHERE c.id = k.concept_id)',
  )
  .all()) {
  const fin = FIN_NODES.includes(k.concept_id)
  console.log(
    `  space=${spaceName(k.project_id)} v${k.version}/${k.status} created=${k.created_at} 属于金融理财已删概念=${fin ? '是！' : '否'}`,
  )
  console.log(`     concept_id=${k.concept_id}`)
}
db.close()
