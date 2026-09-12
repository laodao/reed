// 探针：还原「深度学习」空间当初是怎么被生成的——会话/轨迹/工具调用原文
const Database = require('better-sqlite3')
const db = new Database('C:/Users/daoge/the-bot/the_bot.db', { readonly: true })

const SPACE = 'a13eb877-bf6d-4546-bc43-d08fc010367a'

for (const t of ['agent_sessions', 'agent_trajectories', 'agent_tool_calls', 'agent_tool_artifacts', 'agent_tasks']) {
  const cols = db.prepare(`pragma table_info(${t})`).all()
  console.log(`\n### ${t} 列：`, cols.map((c) => `${c.name}:${c.type}`).join(', '))
  const n = db.prepare(`select count(*) as n from ${t}`).get().n
  console.log(`    总行数 ${n}`)
}

console.log('\n=== agent_sessions 中提到深度学习的行 ===')
const sessCols = db.prepare('pragma table_info(agent_sessions)').all().map((c) => c.name)
const sessWhere = sessCols.map((c) => `"${c}" like '%${SPACE}%'`).join(' or ')
const sessRows = db.prepare(`select * from agent_sessions where ${sessWhere} limit 20`).all()
for (const r of sessRows) {
  const brief = {}
  for (const [k, v] of Object.entries(r)) {
    brief[k] = typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '…' : v
  }
  console.log(JSON.stringify(brief, null, 1))
}

console.log('\n=== agent_trajectories 时间线（深度学习空间） ===')
const trajRows = db
  .prepare(
    `select rowid, * from agent_trajectories where scope_key like ? order by rowid limit 400`
  )
  .all(`%${SPACE}%`)
console.log('命中', trajRows.length, '行')
for (const r of trajRows.slice(0, 40)) {
  const payload = typeof r.payload_json === 'string' ? r.payload_json : JSON.stringify(r.payload_json)
  console.log(
    `[${r.created_at ?? '-'}] scope=${r.scope} scope_key=${r.scope_key} kind=${r.kind ?? '-'} len=${payload?.length} :: ${payload?.slice(0, 400)}`
  )
}

console.log('\n=== agent_tool_calls 时间线（深度学习空间） ===')
const callRows = db
  .prepare(`select rowid, * from agent_tool_calls where session_key like ? or context_json like ? order by rowid limit 400`)
  .all(`%${SPACE}%`, `%${SPACE}%`)
console.log('命中', callRows.length, '行')
for (const r of callRows.slice(0, 60)) {
  const brief = JSON.stringify(r).slice(0, 500)
  console.log(brief)
}
