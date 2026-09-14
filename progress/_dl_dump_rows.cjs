/**
 * 只读：导出指定 rowid 的轨迹全文（看模型收到的上下文与它实际提交的落库参数）
 * 运行: ELECTRON_RUN_AS_NODE=1 electron progress/_dl_dump_rows.cjs rowid1 rowid2 ...
 */
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })

const ids = process.argv.slice(2).map((x) => Number(x)).filter((n) => Number.isFinite(n))
for (const id of ids) {
  const r = db.prepare('SELECT rowid,* FROM agent_trajectories WHERE rowid=?').get(id)
  if (!r) {
    console.log(`\n########## rowid=${id} 不存在 ##########`)
    continue
  }
  console.log(`\n########## rowid=${id} [${r.created_at}] kind=${r.kind} name=${r.name} iter=${r.iteration} len=${String(r.payload_json).length} ##########`)
  const p = r.payload_json
  try {
    const obj = JSON.parse(p)
    for (const [k, v] of Object.entries(obj)) {
      const s = typeof v === 'string' ? v : JSON.stringify(v)
      console.log(`  --[${k}] (${s.length})--`)
      console.log(s.length > 6000 ? `${s.slice(0, 6000)}\n   …（截断，共 ${s.length}）` : s)
    }
  } catch {
    console.log(p.slice(0, 6000))
  }
}
db.close()
