// 查看某文档切片内容里的图片引用（排查 DB 引用）
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })
const doc = process.argv[2] || '5bf8f597-2042-4966-989e-ce6505851353'

const withImg = db
  .prepare("SELECT COUNT(*) c FROM kb_chunks WHERE document_id = ? AND content LIKE '%![%'")
  .get(doc).c
const total = db.prepare('SELECT COUNT(*) c FROM kb_chunks WHERE document_id = ?').get(doc).c
console.log(`切片总数 ${total}，含图片语法 ${withImg}`)

const chaptersWithImg = db
  .prepare("SELECT COUNT(*) c FROM kb_chapters WHERE document_id = ? AND content LIKE '%![%'")
  .get(doc).c
console.log(`章节含图片语法 ${chaptersWithImg}`)

const rows = db
  .prepare('SELECT chunk_index, section_path, substr(content,1,220) s FROM kb_chunks WHERE document_id = ? ORDER BY chunk_index LIMIT 4')
  .all(doc)
for (const r of rows) console.log(`--- #${r.chunk_index} path=${r.section_path}\n${r.s.replace(/\s+/g, ' ')}`)

// 找含感叹号或 OEBPS 的样本
const sample = db
  .prepare("SELECT chunk_index, substr(content,1,200) s FROM kb_chunks WHERE document_id = ? AND (content LIKE '%OEBPS%' OR content LIKE '%![]%') LIMIT 3")
  .all(doc)
console.log('\n含 OEBPS/空 alt 图片的样本:')
for (const r of sample) console.log(`--- #${r.chunk_index}\n${r.s.replace(/\s+/g, ' ')}`)
db.close()
