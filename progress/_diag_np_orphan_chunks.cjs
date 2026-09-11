// 诊断：numpy 文档里没有 section_path 的切片是哪些（大纲路径是否留下未标注的前置块）
// 运行：$env:ELECTRON_RUN_AS_NODE='1'; npx electron progress/_diag_np_orphan_chunks.cjs
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })
const DOC = '4bf87762-a1e3-424f-8f3f-441dfcd9f341'

const rows = db
  .prepare(
    `SELECT id, chunk_index, section_path, length(content) AS len, substr(content, 1, 90) AS head
     FROM kb_chunks WHERE document_id = ? AND (section_path IS NULL OR section_path = '') ORDER BY chunk_index`,
  )
  .all(DOC)
console.log(`无 section_path 的切片: ${rows.length} 条`)
for (const r of rows.slice(0, 10)) console.log(`  #${r.chunk_index} len=${r.len} :: ${String(r.head).replace(/\s+/g, ' ')}`)

const stat = db
  .prepare(
    `SELECT COUNT(*) AS total, AVG(length(content)) AS avgLen, MIN(length(content)) AS minLen, MAX(length(content)) AS maxLen
     FROM kb_chunks WHERE document_id = ?`,
  )
  .get(DOC)
console.log('切片统计:', JSON.stringify(stat))

const hit = db
  .prepare(
    `SELECT chunk_index, section_path, length(content) AS len, substr(content, 1, 120) AS head
     FROM kb_chunks WHERE document_id = ? AND content LIKE '%AtthecoreoftheNumPypackage%' ORDER BY chunk_index`,
  )
  .all(DOC)
console.log(`含 "AtthecoreoftheNumPypackage" 的切片: ${hit.length} 条`)
for (const r of hit) console.log(`  #${r.chunk_index} path=${r.section_path} len=${r.len} :: ${String(r.head).replace(/\s+/g, ' ')}`)
db.close()
