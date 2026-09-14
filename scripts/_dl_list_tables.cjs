/* 列出库内全部表名 */
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })
const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
console.log('total tables:', rows.length)
for (const r of rows) console.log(r.name)
db.close()
