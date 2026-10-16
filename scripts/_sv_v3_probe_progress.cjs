/** 只读探针：查看最近一次 V3 运行的实时进度与视觉质检结果 */
const Database = require('better-sqlite3')
const db = new Database('C:/Users/daoge/code/project/the-bot/.local/sv-v3/userData/the_bot.db', {
  readonly: true,
  fileMustExist: true,
})
const run = db
  .prepare("SELECT id, status, started_at, finished_at, error FROM workflow_runs WHERE definition_id = 'builtin_def_script-to-video-v3' ORDER BY created_at DESC LIMIT 1")
  .get()
console.log('run =', run.id, '| status =', run.status, '|', run.started_at, '→', run.finished_at || '(进行中)')
if (run.error) console.log('error =', run.error)

const parse = s => {
  try {
    return JSON.parse(s || '{}')
  } catch {
    return {}
  }
}

console.log('\n=== 逐镜画面生产（visualShot）===')
for (const n of db
  .prepare("SELECT iteration_index, status, output_json, error FROM workflow_node_runs WHERE run_id = ? AND node_id = 'visualShot' ORDER BY iteration_index")
  .all(run.id)) {
  const o = parse(n.output_json)
  const r = o.result || o
  console.log(
    `#${n.iteration_index} ${n.status} source=${r.source ?? '-'} rel=${r.relevance ?? '-'} attempts=${r.attempts ?? '-'} q=${r.searchQuery || '-'}`,
  )
  if (r.note) console.log('   note: ' + String(r.note).slice(0, 300))
  if (n.error) console.log('   error: ' + n.error)
}

console.log('\n=== 已完成节点（按时间）===')
for (const n of db
  .prepare('SELECT node_id, status, started_at, finished_at FROM workflow_node_runs WHERE run_id = ? ORDER BY started_at DESC LIMIT 10')
  .all(run.id)) {
  console.log(`  ${n.node_id} ${n.status} ${n.started_at || ''} → ${n.finished_at || ''}`)
}
db.close()