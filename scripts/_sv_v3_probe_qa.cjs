/** 只读探针：查该 run 的 start_inputs（visionModel 是否落库）与 visualShot 完整 note */
const Database = require('better-sqlite3')
const db = new Database('C:/Users/daoge/code/project/the-bot/.local/sv-v3/userData/the_bot.db', {
  readonly: true,
  fileMustExist: true,
})
const runId = process.argv[2] || db.prepare("SELECT id FROM workflow_runs WHERE definition_id='builtin_def_script-to-video-v3' ORDER BY created_at DESC LIMIT 1").get().id
console.log('runId =', runId)

const run = db.prepare('SELECT start_inputs, graph_snapshot FROM workflow_runs WHERE id = ?').get(runId)
const j = JSON.parse(run.start_inputs || '{}')
console.log('\n=== start_inputs 关键字段 ===')
for (const k of ['model', 'visionModel', 'stockCredentialId', 'stockProvider', 'stockKind', 'clipSource', 'width', 'height', 'imageProviderConfigId', 'imageModelId', 'videoProviderConfigId']) {
  console.log(`  ${k} = ${JSON.stringify(j[k])}`)
}

// 图快照里 visualShot 的 qa 配置（确认模板表达式与落库一致）
const g = JSON.parse(run.graph_snapshot || '{}')
const vs = (g.nodes || []).find(n => n.id === 'visualShot')
console.log('\n=== graph_snapshot.visualShot 配置 ===')
console.log(JSON.stringify({
  qaProviderConfigId: vs?.config?.qaProviderConfigId,
  qaModelId: vs?.config?.qaModelId,
  minScore: vs?.config?.minScore,
  stockMode: vs?.config?.stockMode,
  stockCredentialId: vs?.config?.stockCredentialId,
}, null, 2))

console.log('\n=== visualShot 完整 note（逐镜）===')
for (const n of db
  .prepare("SELECT iteration_index, output_json, status, error FROM workflow_node_runs WHERE run_id = ? AND node_id = 'visualShot' ORDER BY iteration_index")
  .all(runId)) {
  const o = JSON.parse(n.output_json || '{}')
  const r = o.result || o
  console.log(`#${n.iteration_index} status=${n.status} source=${r.source} relevance=${r.relevance} attempts=${r.attempts}`)
  console.log(`   note: ${r.note}`)
  if (n.error) console.log('   error: ' + n.error)
}

db.close()