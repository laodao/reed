// 诊断：numpy 切片序列与关键句归属（判断是「内容丢失」还是「标号错位」）
// 运行：$env:ELECTRON_RUN_AS_NODE='1'; npx electron progress/_diag_np_chunks2.cjs
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })
const DOC = '4bf87762-a1e3-424f-8f3f-441dfcd9f341'

const probes = [
  'NumPy is the fundamental package for scientific computing',
  'AtthecoreoftheNumPypackage',
  'NumPy arrays have a fixed size at creation',
  'Vectorization describes the absence of any explicit looping',
  'NumPy fully supports an object-oriented approach',
  'NUMPY QUICKSTART',
  'Prerequisites',
  'Besides its obvious scientific uses',
]

for (const p of probes) {
  const rows = db
    .prepare(
      `SELECT chunk_index, section_path, length(content) len FROM kb_chunks
       WHERE document_id = ? AND content LIKE ? ORDER BY chunk_index`,
    )
    .all(DOC, `%${p}%`)
  console.log(
    `「${p.slice(0, 34)}…」→ ` +
      (rows.length ? rows.map(r => `#${r.chunk_index}(len=${r.len},path=${r.section_path})`).join(' ') : '** 不在任何切片中 **'),
  )
}

console.log('\n前 12 个切片（首 160 字）:')
const rows = db
  .prepare(
    `SELECT chunk_index, section_path, length(content) len, replace(substr(content,1,160), char(10), ' ') head
     FROM kb_chunks WHERE document_id = ? ORDER BY chunk_index LIMIT 12`,
  )
  .all(DOC)
for (const r of rows) console.log(`  #${r.chunk_index} path=${r.section_path} len=${r.len}\n     ${r.head}`)
db.close()
