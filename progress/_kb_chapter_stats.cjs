// 直接读 SQLite 统计章节/摘要/切片情况（用 Electron 的 Node 运行以匹配 ABI）
// 用法：$env:ELECTRON_RUN_AS_NODE='1'; npx electron progress/_kb_chapter_stats.cjs [docId]
const path = require('path')
const Database = require('better-sqlite3')

const dbPath = process.env.KB_DB_PATH || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const db = new Database(dbPath, { readonly: true })
const filter = process.argv[2]

const docs = db
  .prepare(
    `SELECT id, name, file_type FROM kb_documents ${filter ? 'WHERE id = ?' : ''} ORDER BY updated_at DESC LIMIT 30`,
  )
  .all(...(filter ? [filter] : []))

for (const d of docs) {
  const chapters = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN summary_status = 'done' THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN summary_status = 'failed' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN summary_status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM kb_chapters WHERE document_id = ?`,
    )
    .get(d.id)
  const chunks = db.prepare('SELECT COUNT(*) AS c FROM kb_chunks WHERE document_id = ?').get(d.id)
  const paths = db
    .prepare(
      `SELECT COUNT(*) AS c FROM kb_chunks WHERE document_id = ? AND section_path IS NOT NULL AND section_path != ''`,
    )
    .get(d.id)
  console.log(
    `${d.id} | ${d.file_type} | ${d.name}\n` +
      `   章节: total=${chapters.total ?? 0} done=${chapters.done ?? 0} failed=${chapters.failed ?? 0} pending=${chapters.pending ?? 0}\n` +
      `   切片: ${chunks.c}（带 section_path ${paths.c}）`,
  )
}
if (!filter) {
  const sample = db
    .prepare(
      `SELECT document_id, title, level, summary_status, substr(COALESCE(summary, summary_error, ''), 1, 40) AS s
       FROM kb_chapters WHERE summary_status != 'pending' LIMIT 8`,
    )
    .all()
  if (sample.length) {
    console.log('\n摘要样例:')
    for (const r of sample) console.log(`   [L${r.level}] ${r.title} | ${r.summary_status} | ${r.s}`)
  }
}
db.close()
