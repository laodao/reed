// 诊断：切片/章节内容里残留的图片引用（临时目录路径 / 绝对路径 / 相对路径）
// 运行：$env:ELECTRON_RUN_AS_NODE='1'; npx electron progress/_diag_image_refs.cjs
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })

const pats = [
  ['临时目录 kb-epub/kb-ebook', '%kb-epub-%'],
  ['临时目录 kb-ebook', '%kb-ebook-%'],
  ['Windows 临时目录 AppData\\Local\\Temp', '%AppData%Temp%'],
  ['file:// 协议', '%file://%'],
  ['Markdown 图片语法', '%![%'],
  ['<img 标签', '%<img%'],
  ['dataPath 相对（knowledge-base/）', '%knowledge-base/%'],
]

for (const [label, like] of pats) {
  const chunks = db
    .prepare(`SELECT COUNT(*) c FROM kb_chunks WHERE content LIKE ?`)
    .get(like).c
  const chapters = db
    .prepare(`SELECT COUNT(*) c FROM kb_chapters WHERE content LIKE ?`)
    .get(like).c
  console.log(`${label}: 切片 ${chunks} / 章节 ${chapters}`)
}

console.log('\n含 <img 或 ![ 的切片样例（前 6 条）:')
const rows = db
  .prepare(
    `SELECT document_id, chunk_index, substr(content, 1, 240) head
     FROM kb_chunks WHERE content LIKE '%<img%' OR content LIKE '%![%' LIMIT 6`,
  )
  .all()
for (const r of rows) {
  console.log(`  doc=${r.document_id.slice(0, 8)} #${r.chunk_index}\n     ${String(r.head).replace(/\s+/g, ' ')}`)
}

console.log('\n含 Temp 的切片样例（前 6 条）:')
const tmpRows = db
  .prepare(
    `SELECT document_id, chunk_index, substr(content, 1, 240) head
     FROM kb_chunks WHERE content LIKE '%Temp%' OR content LIKE '%temp%' LIMIT 6`,
  )
  .all()
for (const r of tmpRows) {
  console.log(`  doc=${r.document_id.slice(0, 8)} #${r.chunk_index}\n     ${String(r.head).replace(/\s+/g, ' ')}`)
}

console.log('\n文档类型分布（含图片的格式）:')
for (const r of db.prepare('SELECT file_type, COUNT(*) c FROM kb_documents GROUP BY file_type').all()) {
  console.log(`  ${r.file_type}: ${r.c}`)
}
db.close()
