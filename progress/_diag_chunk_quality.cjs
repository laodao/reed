// 诊断：切片质量（空章节路径 '[]' / 过短切片 / 纯标题切片）——大纲路径下 2137 个标题会带来什么
// 运行：$env:ELECTRON_RUN_AS_NODE='1'; npx electron progress/_diag_chunk_quality.cjs
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })

const DOCS = [
  ['numpy-user.pdf', '4bf87762-a1e3-424f-8f3f-441dfcd9f341'],
  ['深度学习.epub', '5bf8f597-2042-4966-989e-ce6505851353'],
  ['公司法.docx', '48c7b99f-e63f-42b9-82fb-891f5cf828f7'],
]

for (const [name, docId] of DOCS) {
  const total = db.prepare('SELECT COUNT(*) c FROM kb_chunks WHERE document_id = ?').get(docId).c
  const emptyPath = db
    .prepare(`SELECT COUNT(*) c FROM kb_chunks WHERE document_id = ? AND (section_path IS NULL OR section_path = '' OR section_path = '[]')`)
    .get(docId).c
  const tiny = db
    .prepare('SELECT COUNT(*) c FROM kb_chunks WHERE document_id = ? AND length(content) < 100')
    .get(docId).c
  const headingOnly = db
    .prepare(`SELECT COUNT(*) c FROM kb_chunks WHERE document_id = ? AND length(trim(content)) < 120 AND (content LIKE '#%' OR content LIKE '%##%')`)
    .get(docId).c
  const avg = db.prepare('SELECT AVG(length(content)) a FROM kb_chunks WHERE document_id = ?').get(docId).a
  console.log(`${name}: 总 ${total} | 空章节路径 ${emptyPath} | <100 字 ${tiny} | 疑似纯标题 ${headingOnly} | 平均 ${Math.round(avg)} 字`)
}

console.log('\nnumpy 前 8 个切片:')
const rows = db
  .prepare(
    `SELECT chunk_index, section_path, length(content) len, replace(substr(content,1,80), char(10), ' ') head
     FROM kb_chunks WHERE document_id = ? ORDER BY chunk_index LIMIT 8`,
  )
  .all('4bf87762-a1e3-424f-8f3f-441dfcd9f341')
for (const r of rows) console.log(`  #${r.chunk_index} path=${r.section_path} len=${r.len} :: ${r.head}`)

console.log('\nnumpy 最短的 10 个切片:')
const small = db
  .prepare(
    `SELECT chunk_index, section_path, length(content) len, replace(substr(content,1,80), char(10), ' ') head
     FROM kb_chunks WHERE document_id = ? ORDER BY length(content) LIMIT 10`,
  )
  .all('4bf87762-a1e3-424f-8f3f-441dfcd9f341')
for (const r of small) console.log(`  #${r.chunk_index} path=${r.section_path} len=${r.len} :: ${r.head}`)
db.close()
