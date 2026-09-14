// 只读：打印全部知识点（名称 + 英文 + 目录 + 讲义/关系 + 定义摘要），按名称排序，供人工通读
const Database = require('better-sqlite3')
const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'
const FROM = Number(process.argv[3] || 0)
const LIMIT = Number(process.argv[4] || 9999)
const db = new Database(DB_PATH, { readonly: true })

const nodes = db
  .prepare("SELECT * FROM dl_concept WHERE project_id=? AND node_type<>'group' ORDER BY name")
  .all(SPACE)
const cards = db.prepare('SELECT concept_id,version,status FROM dl_card WHERE project_id=?').all(SPACE)
const rels = db.prepare('SELECT source_id,target_id FROM dl_relation WHERE project_id=?').all(SPACE)
const allNodes = db.prepare('SELECT id,name,node_type FROM dl_concept WHERE project_id=?').all(SPACE)
const nodeName = new Map(allNodes.map((n) => [n.id, n.name]))
const nodeType = new Map(allNodes.map((n) => [n.id, n.node_type]))
const cardCnt = new Map()
for (const k of cards) cardCnt.set(k.concept_id, (cardCnt.get(k.concept_id) || 0) + 1)
const relCnt = new Map()
for (const r of rels) {
  relCnt.set(r.source_id, (relCnt.get(r.source_id) || 0) + 1)
  relCnt.set(r.target_id, (relCnt.get(r.target_id) || 0) + 1)
}

console.log(`共 ${nodes.length} 个知识点（本次打印 ${FROM + 1}~${Math.min(FROM + LIMIT, nodes.length)}）`)
for (const c of nodes.slice(FROM, FROM + LIMIT)) {
  const parent = c.parent_id ? (nodeName.get(c.parent_id) || c.parent_id) : '根层'
  const bad = c.parent_id && nodeType.get(c.parent_id) !== 'group' ? ' [目录非group]' : ''
  console.log(
    `${c.name} | en=${c.en || '-'} | 目录=${parent}${bad} | 卡${cardCnt.get(c.id) || 0} 边${relCnt.get(c.id) || 0} | ${c.mastery}/${c.research} | def: ${(c.definition_short || '').replace(/\s+/g, ' ').slice(0, 70)}`,
  )
}
db.close()
