/**
 * 只读：按 toolCallId 配对 agent_trajectories 里的 tool_call / tool_result，输出每个落库调用的成败
 * 运行: ELECTRON_RUN_AS_NODE=1 electron progress/_dl_call_pairs.cjs [spaceId]
 */
const Database = require('better-sqlite3')
const SPACE = process.argv[2] || '5d586839-607f-4d57-b8d5-a0b51b276586'
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })

const rows = db
  .prepare('SELECT rowid,* FROM agent_trajectories WHERE scope_key LIKE ? ORDER BY rowid')
  .all(`%${SPACE}%`)

const byCall = new Map()
for (const r of rows) {
  if (r.kind !== 'tool_call' && r.kind !== 'tool_result') continue
  let p
  try {
    p = JSON.parse(r.payload_json)
  } catch {
    continue
  }
  const id = p.toolCallId
  if (!id) continue
  const e = byCall.get(id) ?? { name: r.name, iter: r.iteration, at: r.created_at }
  if (r.kind === 'tool_call') {
    e.args = p.args
    e.name = r.name
  } else {
    e.ok = p.ok
    e.error = p.error
    e.hint = p.hint
    e.result = p.result
  }
  byCall.set(id, e)
}

const entries = [...byCall.values()]
const dl = entries.filter((e) => String(e.name).startsWith('dl_'))
console.log(`===== 落库类调用 ${dl.length} 个（按时间） =====`)
for (const e of dl) {
  const args = e.args ? JSON.stringify(e.args) : ''
  const name = /"name":"([^"]+)"/.exec(args)?.[1] ?? ''
  const src = /"sourceId":"([^"]+)"/.exec(args)?.[1] ?? ''
  const tgt = /"targetId":"([^"]+)"/.exec(args)?.[1] ?? ''
  console.log(
    `iter=${e.iter} ${String(e.name).padEnd(18)} ${e.ok === false ? `✗ ${e.error} ${e.hint ?? ''}` : '✓'} ${name || (src ? `${src}→${tgt}` : '')}`,
  )
}
const failed = dl.filter((e) => e.ok === false)
console.log(`\n===== 失败 ${failed.length} 个 =====`)
for (const e of failed) console.log(`  ${e.name} ${e.error} — ${JSON.stringify(e.args).slice(0, 220)}`)

console.log('\n===== 非落库调用（采集/技能）统计 =====')
const others = new Map()
for (const e of entries.filter((x) => !String(x.name).startsWith('dl_'))) {
  const cur = others.get(e.name) ?? { n: 0, fail: 0 }
  cur.n++
  if (e.ok === false) cur.fail++
  others.set(e.name, cur)
}
for (const [k, v] of others) console.log(`  ${k}: ${v.n} 次（失败 ${v.fail}）`)
db.close()
