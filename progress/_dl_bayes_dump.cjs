/**
 * 只读取证：验收·贝叶斯入门 空间全量节点 + 讲义卡（导出 JSON 供分析）
 * 用法：ELECTRON_RUN_AS_NODE=1 electron progress/_dl_bayes_dump.cjs [dbPath]
 */
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'
const OUT = path.join(__dirname, '_dl_bayes_dump.json')

const db = new Database(DB_PATH, { readonly: true })
const proj = db.prepare('SELECT * FROM dl_project WHERE id=?').get(SPACE)
console.log('空间:', proj.name, '| goal=', proj.goal, '| status=', proj.status, '| created=', proj.created_at)

const nodes = db.prepare('SELECT * FROM dl_concept WHERE project_id=? ORDER BY created_at').all(SPACE)
const cards = db.prepare('SELECT * FROM dl_card WHERE project_id=? ORDER BY concept_id, version').all(SPACE)
const rels = db.prepare('SELECT * FROM dl_relation WHERE project_id=?').all(SPACE)
const qs = db.prepare('SELECT * FROM dl_question WHERE project_id=?').all(SPACE)
const notes = db.prepare('SELECT * FROM dl_note WHERE project_id=?').all(SPACE)
const logs = db.prepare('SELECT * FROM dl_mastery_log WHERE project_id=?').all(SPACE)
const docs = db.prepare('SELECT * FROM dl_doc WHERE project_id=?').all(SPACE)
const plans = db.prepare('SELECT * FROM dl_plan WHERE project_id=?').all(SPACE)

const byId = new Map(nodes.map((n) => [n.id, n]))
const groups = nodes.filter((n) => n.node_type === 'group')
const leaves = nodes.filter((n) => n.node_type !== 'group')
console.log(`节点 ${nodes.length}（分组 ${groups.length} / 知识点 ${leaves.length}）`)
console.log(`讲义卡 ${cards.length}｜关系边 ${rels.length}｜答疑 ${qs.length}｜笔记 ${notes.length}｜掌握度 ${logs.length}｜文档 ${docs.length}｜方案 ${plans.length}`)

console.log('\n分组目录：')
for (const g of groups) {
  const kids = leaves.filter((l) => l.parent_id === g.id).length
  console.log(`  ${g.name} (id=${g.id}) 直属知识点=${kids} parent=${g.parent_id ?? 'null'}`)
}

const cardsByConcept = new Map()
for (const k of cards) {
  if (!cardsByConcept.has(k.concept_id)) cardsByConcept.set(k.concept_id, [])
  cardsByConcept.get(k.concept_id).push(k)
}

console.log('\n知识点（按名称排序）：')
const sorted = leaves.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh'))
for (const c of sorted) {
  const ks = cardsByConcept.get(c.id) || []
  const parent = c.parent_id ? (byId.get(c.parent_id) || {}).name : '根层'
  console.log(
    `  [${c.name}] en=${c.en ?? '-'} | 目录=${parent} | research=${c.research_state} mastery=${c.mastery} source=${c.source} | 讲义=${ks.map((k) => `v${k.version}/${k.status}`).join(',') || '无'} | def=${(c.definition_short || '').slice(0, 40)}`,
  )
}

fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      project: proj,
      nodes,
      cards: cards.map((k) => ({ ...k, sections_len: (k.sections || '').length })),
      relations: rels,
      questions: qs,
      notes,
      masteryLogs: logs,
      docs,
      plans,
    },
    null,
    2,
  ),
)
console.log(`\n已导出：${OUT}（${(fs.statSync(OUT).size / 1024).toFixed(0)} KB）`)
db.close()
