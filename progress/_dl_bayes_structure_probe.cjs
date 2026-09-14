// 只读：去重后的结构性现状（被当目录用的非 group 节点 / 根层游离 / 遗留悬挂边与孤儿卡 / B 类残留）
const Database = require('better-sqlite3')
const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'
const db = new Database(DB_PATH, { readonly: true })

const nodes = db.prepare('SELECT * FROM dl_concept WHERE project_id=?').all(SPACE)
const byId = new Map(nodes.map((n) => [n.id, n]))
const leaves = nodes.filter((n) => n.node_type !== 'group')

console.log(`空间节点：${nodes.length}（目录 group ${nodes.length - leaves.length} / 知识点 ${leaves.length}）`)

console.log('\n① 被当作目录用的「非 group」节点（左栏树不会展开其子节点 → 子概念在树里不可达）')
const usedAsParent = new Map()
for (const n of leaves) {
  if (!n.parent_id) continue
  const p = byId.get(n.parent_id)
  if (p && p.node_type !== 'group') {
    if (!usedAsParent.has(p.id)) usedAsParent.set(p.id, { parent: p, kids: [] })
    usedAsParent.get(p.id).kids.push(n.name)
  }
}
for (const { parent, kids } of usedAsParent.values())
  console.log(`  ${parent.name} [${parent.node_type}] → ${kids.length} 个子节点：${kids.join('、')}`)
if (!usedAsParent.size) console.log('  （无）')

console.log('\n② 根层游离知识点（parent_id 为空，不在任何目录下）')
const rootLevel = leaves.filter((n) => !n.parent_id)
console.log(`  共 ${rootLevel.length} 个：${rootLevel.map((n) => n.name).slice(0, 25).join('、')}${rootLevel.length > 25 ? ' …' : ''}`)

console.log('\n③ 目录分布')
for (const g of nodes.filter((n) => n.node_type === 'group'))
  console.log(`  ${g.name}: 直属知识点 ${leaves.filter((l) => l.parent_id === g.id).length}`)

console.log('\n④ 遗留数据问题（早前原型把概念名当 id 落库）')
const dangling = db
  .prepare(
    `SELECT r.* FROM dl_relation r WHERE r.project_id=?
       AND (NOT EXISTS (SELECT 1 FROM dl_concept c WHERE c.id=r.source_id)
         OR NOT EXISTS (SELECT 1 FROM dl_concept c WHERE c.id=r.target_id))`,
  )
  .all(SPACE)
for (const r of dangling) console.log(`  悬挂边：${r.source_id} → ${r.target_id} (${r.relation_type})`)
const orphanCards = db
  .prepare(
    `SELECT k.* FROM dl_card k WHERE k.project_id=?
       AND NOT EXISTS (SELECT 1 FROM dl_concept c WHERE c.id=k.concept_id)`,
  )
  .all(SPACE)
for (const k of orphanCards) console.log(`  孤儿讲义卡：concept_id=${k.concept_id} v${k.version}/${k.status}`)
if (!dangling.length && !orphanCards.length) console.log('  （无）')
db.close()
