// 列出星宇/吃瓜相关资产（只读）
const Database = require('better-sqlite3')
const db = new Database('C:/Users/daoge/the-bot/the_bot.db', { readonly: true })
try {
  const rows = db.prepare(`SELECT id, name, category, kind, length(text_content) tl, length(json_content) jl, created_at, updated_at
      FROM assets WHERE name LIKE '%星宇%' OR name LIKE '%吃瓜%' OR name LIKE '%短视频脚本%' OR name LIKE '%校招%'
      ORDER BY updated_at DESC`).all()
  console.log('MATCHED:', rows.length)
  for (const r of rows) {
    console.log(`- ${r.id} | ${r.name} | cat=${r.category} kind=${r.kind} | text=${r.tl} json=${r.jl} | created=${r.created_at} | updated=${r.updated_at}`)
  }
} finally {
  db.close()
}
