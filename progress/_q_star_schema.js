// 探查资产库表结构与星宇相关资产（只读）
const Database = require('better-sqlite3')
const db = new Database('C:/Users/daoge/the-bot/the_bot.db', { readonly: true })
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%asset%' OR name LIKE '%file%') ORDER BY name").all()
  console.log('TABLES:', tables.map(t => t.name).join(', '))
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info(${t.name})`).all()
    console.log(`\n== ${t.name} ==`)
    console.log(cols.map(c => `${c.name}:${c.type}`).join(' | '))
    try {
      const n = db.prepare(`SELECT COUNT(*) n FROM ${t.name}`).get()
      console.log('rows:', n.n)
    } catch (e) { console.log('count err:', e.message) }
  }
} finally {
  db.close()
}
