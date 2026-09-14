// 导出吃瓜报告全文到 progress/_star_report_full.md（只读 DB → utf8 文件）
const Database = require('better-sqlite3')
const fs = require('fs')
const db = new Database('C:/Users/daoge/the-bot/the_bot.db', { readonly: true })
try {
  const r = db.prepare("SELECT id, name, text_content FROM assets WHERE id='asset_1788530563090_xcovls55z'").get()
  fs.writeFileSync('progress/_star_report_full.md', `# ${r.name} (${r.id})\n\n${r.text_content}\n`, 'utf8')
  console.log('exported len:', (r.text_content || '').length)
} finally {
  db.close()
}
