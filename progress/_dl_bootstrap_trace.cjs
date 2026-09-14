// 探针：定位 09-10 首轮起步研究时，五阶段指令（bootstrap）出现在哪条轨迹、哪个字段
const Database = require('better-sqlite3')
const db = new Database('C:/Users/daoge/the-bot/the_bot.db', { readonly: true })

const SPACE = 'a13eb877-bf6d-4546-bc43-d08fc010367a'
const rows = db
  .prepare(
    `select rowid, kind, name, payload_json, created_at from agent_trajectories
     where scope_key like ? order by rowid`
  )
  .all(`%${SPACE}%`)

const NEEDLES = ['S1 资料探查', '领域起步研究员', 'S2 知识骨架', '起步研究']

for (const r of rows) {
  const payload = r.payload_json || ''
  if (!NEEDLES.some((n) => payload.includes(n))) continue
  let p
  try {
    p = JSON.parse(payload)
  } catch {
    continue
  }
  console.log(`\n### rowid=${r.rowid} [${r.created_at}] kind=${r.kind} name=${r.name} 字段=${Object.keys(p).join(',')}`)
  for (const [k, v] of Object.entries(p)) {
    if (typeof v !== 'string') continue
    if (!NEEDLES.some((n) => v.includes(n))) continue
    const i = v.indexOf('你是「领域共学空间」的领域起步研究员')
    const from = i >= 0 ? i : Math.max(0, v.search(/S1 资料探查/) - 400)
    console.log(`  -- 字段 ${k}（长 ${v.length}）片段：`)
    console.log(v.slice(from, from + 1200).replace(/^\s*$/gm, ''))
  }
  if (r.created_at > '2026-09-10 13:00:00') break
}
