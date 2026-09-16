// 只读：贝叶斯空间是否还有在途 agent 轮次（防删完被写回）
const Database = require('better-sqlite3')
const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'
const db = new Database(DB_PATH, { readonly: true })

console.log('=== agent_tasks 非终态')
const tasks = db
  .prepare("SELECT id,title,status,executor,created_at,updated_at FROM agent_tasks WHERE status NOT IN ('succeeded','failed','cancelled') ORDER BY updated_at DESC LIMIT 10")
  .all()
console.log(tasks.length ? tasks.map((t) => JSON.stringify(t)).join('\n') : '  （无）')

console.log('\n=== 本空间最近轨迹 8 条')
for (const r of db
  .prepare('SELECT seq,iteration,kind,name,created_at FROM agent_trajectories WHERE scope_key LIKE ? ORDER BY created_at DESC LIMIT 8')
  .all(`%${SPACE}%`))
  console.log('  ', JSON.stringify(r))

console.log('\n=== 本空间各轮次（scope_key -> 时间范围/条数）')
for (const r of db
  .prepare('SELECT scope_key, COUNT(*) n, MIN(created_at) f, MAX(created_at) l FROM agent_trajectories WHERE scope_key LIKE ? GROUP BY scope_key ORDER BY l DESC LIMIT 15')
  .all(`%${SPACE}%`))
  console.log(`  ${r.n} 条  ${r.f} → ${r.l}\n     ${r.scope_key}`)

console.log('\n=== 服务器时间', new Date().toISOString())
db.close()
