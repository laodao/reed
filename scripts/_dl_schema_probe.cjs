/* 探查 dl 表 schema(只读) */
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })
for (const t of ['dl_projects', 'dl_concepts', 'dl_cards', 'dl_questions', 'dl_relations', 'dl_notes', 'dl_mastery_logs']) {
  try {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t)
    console.log('==== ' + t)
    console.log(row ? row.sql : '(missing)')
  } catch (e) {
    console.log(t, 'ERR', e.message)
  }
}
db.close()
