/**
 * 只读：检查 dl_plan 里知识体系方案是否含 rootConcepts / notes
 * （2026-09-14 排查用：确认弹窗只渲染 branches，确认时会把 rootConcepts/notes 丢掉）
 * 运行: ELECTRON_RUN_AS_NODE=1 electron progress/_dl_plan_root_probe.cjs [dbPath]
 *       缺省 dbPath = C:\Users\daoge\the-bot\the_bot.db
 */
const Database = require('better-sqlite3')
const dbPath = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const db = new Database(dbPath, { readonly: true })
console.log(`[plan] db=${dbPath}`)

const hasPlan = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='dl_plan'").get()
if (!hasPlan) {
  console.log('[plan] 无 dl_plan 表，跳过')
  db.close()
  process.exit(0)
}

const rows = db
  .prepare("SELECT project_id, step, status, revision, created_at, payload FROM dl_plan ORDER BY created_at DESC LIMIT 30")
  .all()

console.log(`[plan] 最近 ${rows.length} 条方案：`)
for (const r of rows) {
  const p = JSON.parse(r.payload || '{}')
  if (r.step !== 'syllabus') {
    console.log(`  [${r.created_at}] ${r.step} status=${r.status} rev=${r.revision}`)
    continue
  }
  const branches = p.branches ?? []
  const concepts = branches.reduce((n, b) => n + (b.concepts ?? []).length, 0)
  const roots = p.rootConcepts ?? []
  console.log(
    `  [${r.created_at}] ${r.step} status=${r.status} rev=${r.revision} ` +
      `分支=${branches.length} 知识点=${concepts} rootConcepts=${roots.length}${roots.length ? `（${roots.map((c) => c.name).join('、')}）` : ''} ` +
      `notes=${p.notes ? '有' : '无'} project=${r.project_id}`,
  )
}

const rootTotal = rows
  .filter((r) => r.step === 'syllabus')
  .map((r) => JSON.parse(r.payload || '{}'))
  .reduce((n, p) => n + (p.rootConcepts ?? []).length, 0)
console.log(`[plan] 知识体系方案里的 rootConcepts 合计 = ${rootTotal}`)

const spaces = db
  .prepare('SELECT id, name, created_at FROM dl_project ORDER BY created_at DESC LIMIT 10')
  .all()
console.log(`[plan] 最近 ${spaces.length} 个学习空间：`)
for (const s of spaces) console.log(`  [${s.created_at}] ${s.name} (${s.id})`)
db.close()
