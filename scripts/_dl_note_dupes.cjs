/* 查 dl_note 同 (project_id, question_id) 重复行(只读) */
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })
const rows = db.prepare(
  `SELECT project_id, question_id, COUNT(*) AS n FROM dl_note WHERE question_id IS NOT NULL GROUP BY project_id, question_id HAVING COUNT(*) > 1`
).all()
console.log('重复 qna 组数:', rows.length)
for (const r of rows.slice(0, 20)) console.log(r.project_id, r.question_id, 'x' + r.n)
const total = db.prepare('SELECT COUNT(*) AS n FROM dl_note').get()
console.log('note 总数:', total.n)
db.close()
