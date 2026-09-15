/**
 * 一次性排查脚本：查「最近生成的讲义」（只读打开，不动数据）
 * 用法（better-sqlite3 是 Electron ABI，需用 electron 跑）：
 *   $env:ELECTRON_RUN_AS_NODE='1'; node_modules\electron\dist\electron.exe scripts\_query-lessons.cjs
 */
const path = require('path')
const Database = require('better-sqlite3')

const dbPath = process.argv[2] || 'C:/Users/daoge/the-bot/the_bot.db'
const db = new Database(dbPath, { readonly: true, fileMustExist: true })

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n)

/** 列存在性（本次改造新增 spec 列；老库还没跑迁移时不能直接查） */
const cols = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name))
const cardCols = cols('dl_card')
const planCols = cols('dl_plan')
const hasSpec = cardCols.has('spec')
const hasConceptId = planCols.has('concept_id')

console.log('=== 概览 ===')
const total = db.prepare('SELECT COUNT(*) n FROM dl_card').get().n
const withLayout = db.prepare("SELECT COUNT(*) n FROM dl_card WHERE sections LIKE '%\"layout\"%'").get().n
const withSpec = hasSpec ? db.prepare('SELECT COUNT(*) n FROM dl_card WHERE spec IS NOT NULL').get().n : -1
const planLessons = db.prepare("SELECT COUNT(*) n FROM dl_plan WHERE step = 'lesson'").get().n
console.log(`dl_card 总数=${total}；含 layout 的卡=${withLayout}；含 spec 的卡=${withSpec}；lesson 方案行=${planLessons}`)
console.log(`库结构：dl_card.spec ${hasSpec ? '有' : '无（迁移未跑）'}；dl_plan.concept_id ${hasConceptId ? '有' : '无（迁移未跑）'}`)

console.log('\n=== 最近 12 张「当前版」讲义 ===')
const rows = db
  .prepare(
    `
    SELECT k.id AS card_id, k.concept_id, c.name AS concept, p.name AS space, k.project_id,
           k.version, k.status, k.essence_type, k.created_at,
           k.sections, k.evidence_sources${hasSpec ? ', k.spec' : ''}
    FROM dl_card k
    LEFT JOIN dl_concept c ON c.id = k.concept_id
    LEFT JOIN dl_project p ON p.id = k.project_id
    WHERE k.version = (SELECT MAX(version) FROM dl_card k2 WHERE k2.concept_id = k.concept_id)
    ORDER BY k.created_at DESC
    LIMIT 12
  `,
  )
  .all()

for (const r of rows) {
  let sections = []
  try {
    sections = JSON.parse(r.sections || '[]')
  } catch {}
  const layouts = sections.map((s) => `${s.key}:${s.layout ?? '—'}`).join(' ')
  const figures = (r.sections || '').split('```figure').length - 1
  const tables = sections.filter((s) => /^\s*\|/m.test(s.md || '')).length
  const codes = (r.sections || '').split('```js').length - 1
  console.log(
    `- [${r.created_at}] 「${r.concept ?? '?'}」@${r.space ?? '?'} v${r.version} ${r.status} ${r.essence_type}\n` +
      `    card=${r.card_id} concept=${r.concept_id} space=${r.project_id}\n` +
      `    区=${sections.length} 图=${figures} 表=${tables} 可运行代码=${codes} spec=${r.spec ? '有' : '无'} 证据=${(() => { try { return JSON.parse(r.evidence_sources || '[]').length } catch { return '?' } })()}\n` +
      `    版式：${layouts || '（无 layout 字段）'}`,
  )
}

console.log('\n=== 最近有讲义产出的空间 ===')
const spaces = db
  .prepare(
    `
    SELECT p.id, p.name, p.goal, p.updated_at, COUNT(*) AS cards, MAX(k.created_at) AS last_card
    FROM dl_card k
    JOIN dl_project p ON p.id = k.project_id
    GROUP BY p.id
    ORDER BY last_card DESC
    LIMIT 5
  `,
  )
  .all()
for (const s of spaces) {
  const concepts = db.prepare('SELECT COUNT(*) n FROM dl_concept WHERE project_id = ?').get(s.id).n
  console.log(`- 「${s.name}」（${s.goal}）概念 ${concepts} 个 / 讲义 ${s.cards} 张；最近一张 ${s.last_card}；space=${s.id}`)
}

console.log('\n=== 最近 6 份 lesson 讲义方案 ===')
const plans = db
  .prepare(
    `
    SELECT pl.project_id, ${hasConceptId ? 'pl.concept_id' : 'NULL AS concept_id'}, c.name AS concept,
           p.name AS space, pl.status, pl.revision, pl.created_at, pl.updated_at
    FROM dl_plan pl
    LEFT JOIN dl_concept c ON c.id = ${hasConceptId ? 'pl.concept_id' : 'NULL'}
    LEFT JOIN dl_project p ON p.id = pl.project_id
    WHERE pl.step = 'lesson'
    ORDER BY pl.created_at DESC
    LIMIT 6
  `,
  )
  .all()
for (const p of plans) console.log(`- [${p.created_at}] 「${p.concept}」@${p.space} ${p.status} rev${p.revision}`)

db.close()
