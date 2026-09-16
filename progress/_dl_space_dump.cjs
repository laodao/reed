/**
 * 只读：按名字片段定位空间并打印空间/概念树/关系/答疑/节奏设置
 * 运行: ELECTRON_RUN_AS_NODE=1 electron progress/_dl_space_dump.cjs [nameLike] [dbPath]
 */
const Database = require('better-sqlite3')

const LIKE = process.argv[2] || '金融'
const DB_PATH = process.argv[3] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const db = new Database(DB_PATH, { readonly: true })

const projects = db.prepare('SELECT * FROM dl_project ORDER BY created_at').all()
console.log('[dump] 全部空间:')
for (const p of projects) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM dl_concept WHERE project_id=?').get(p.id).n
  console.log(`  ${p.created_at} | ${p.name} | id=${p.id} | goal=${p.goal} | 概念 ${n}`)
}

const target = projects.filter((p) => String(p.name || '').includes(LIKE))
if (!target.length) {
  console.log(`\n[dump] 没有名字含「${LIKE}」的空间`)
  process.exit(0)
}

for (const p of target) {
  console.log(`\n======== 空间「${p.name}」 id=${p.id} ========`)
  console.log('  原始行:', JSON.stringify(p).slice(0, 800))
  const concepts = db.prepare('SELECT * FROM dl_concept WHERE project_id=? ORDER BY created_at').all(p.id)
  const byId = new Map(concepts.map((c) => [c.id, c]))
  console.log(`\n  --- 概念树（${concepts.length} 个节点）---`)
  const childrenOf = (pid) => concepts.filter((c) => (c.parent_id ?? null) === pid)
  const print = (c, depth) => {
    const attrs = c.attrs ? JSON.parse(c.attrs) : null
    const prereq = attrs?.prerequisites ? ` 前置=[${attrs.prerequisites.join('、')}]` : ''
    const layer = attrs?.layer != null ? ` layer=${attrs.layer}` : ''
    const ev = attrs?.evidenceLevel ? ` 证据=${String(attrs.evidenceLevel).slice(0, 40)}` : ''
    console.log(
      `${'  '.repeat(depth + 2)}- [${c.node_type}] ${c.name}${layer}${prereq}${ev}\n` +
        `${'  '.repeat(depth + 3)}state=${c.research_state} mastery=${c.mastery} card=${c.card_id ? 'yes' : 'no'} src=${c.source}\n` +
        `${'  '.repeat(depth + 3)}定义: ${(c.definition_short || '（无）').replace(/\s+/g, ' ').slice(0, 110)}`,
    )
    for (const ch of childrenOf(c.id)) print(ch, depth + 1)
  }
  for (const root of childrenOf(null)) print(root, 0)

  const rels = db.prepare('SELECT * FROM dl_relation WHERE project_id=? ORDER BY created_at').all(p.id)
  console.log(`\n  --- 关系边 ${rels.length} 条 ---`)
  for (const r of rels) {
    const s = byId.get(r.source_id)
    const t = byId.get(r.target_id)
    console.log(`  ${s ? s.name : r.source_id} → ${t ? t.name : r.target_id} (${r.relation_type}, verified=${r.verified})`)
  }

  const qs = db.prepare('SELECT * FROM dl_question WHERE project_id=? ORDER BY created_at').all(p.id)
  console.log(`\n  --- 答疑 ${qs.length} 条 ---`)
  for (const q of qs) console.log(`  [${q.status}] ${String(q.question).slice(0, 100)}`)

  const cards = db.prepare('SELECT concept_id,version,status FROM dl_card WHERE project_id=?').all(p.id)
  console.log(`\n  --- 讲义卡 ${cards.length} 张 ---`)
  for (const k of cards) console.log(`  ${byId.get(k.concept_id)?.name ?? k.concept_id} v${k.version} ${k.status}`)
}
db.close()
