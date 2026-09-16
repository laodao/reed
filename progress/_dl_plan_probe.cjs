/**
 * 只读：检查 dl_plan 表与某空间的方案版本（里程碑 3 上线后核对用）
 * 运行: ELECTRON_RUN_AS_NODE=1 electron progress/_dl_plan_probe.cjs [spaceId]
 */
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })

const has = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='dl_plan'").get()
console.log('[plan] dl_plan 表存在:', has)
if (!has) process.exit(0)
console.log('[plan] 列:', db.prepare('PRAGMA table_info(dl_plan)').all().map((c) => c.name).join(', '))

const spaceId = process.argv[2]
const rows = spaceId
  ? db.prepare('SELECT * FROM dl_plan WHERE project_id=? ORDER BY step, revision').all(spaceId)
  : db.prepare('SELECT * FROM dl_plan ORDER BY created_at DESC LIMIT 20').all()
console.log(`[plan] 行数=${rows.length}${spaceId ? `（空间 ${spaceId}）` : '（全库最近 20 条）'}`)
for (const r of rows) {
  const payload = JSON.parse(r.payload || '{}')
  const brief =
    r.step === 'understanding'
      ? `goal=${String(payload.goalSummary ?? '').slice(0, 40)} coverage=${(payload.coverage ?? []).length} 项`
      : `分支=${(payload.branches ?? []).length} 知识点=${(payload.branches ?? []).reduce((n, b) => n + (b.concepts ?? []).length, 0)}`
  console.log(`  [${r.created_at}] step=${r.step} status=${r.status} rev=${r.revision} ${brief}`)
}
db.close()
