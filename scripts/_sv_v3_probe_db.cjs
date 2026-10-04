/**
 * 只读探针：隔离库里 V3 定义是否已同步到最新（published_graph 含 visualShot/sceneText），
 * 并取出最近一次「脚本生成视频」运行的真实 start_inputs（复用 provider/voice/模型 id）。
 * 用法：ELECTRON_RUN_AS_NODE=1 electron.exe scripts/_sv_v3_probe_db.cjs
 */
const Database = require('better-sqlite3')
const dbPath = process.argv[2] || 'C:/Users/daoge/code/project/the-bot/.local/sv-v3/userData/the_bot.db'
const db = new Database(dbPath, { readonly: true, fileMustExist: true })

console.log('=== 脚本生成视频相关定义 ===')
const defs = db
  .prepare(
    `SELECT id, name, published_version, length(published_graph) AS len, updated_at
     FROM workflow_definitions
     WHERE id LIKE '%script-to-video%' OR name LIKE '%脚本生成视频%'`,
  )
  .all()
for (const d of defs) console.log(JSON.stringify(d))

const v3 = db.prepare("SELECT published_graph FROM workflow_definitions WHERE id = 'builtin_def_script-to-video-v3'").get()
if (v3) {
  const g = v3.published_graph || ''
  console.log('\nV3 published_graph 校验：')
  for (const [k, expect] of [
    ['visualShot', true],
    ['segPlan', true],
    ['sceneText', true],
    ['stockCredentialId', true],
    ['shotPack', false],
    ['imgShot', false],
  ]) {
    const hit = g.includes(k)
    console.log(`  ${k}: ${hit} ${hit === expect ? '✓' : '✗ 与预期不符'}`)
  }
}

console.log('\n=== 最近 5 次（脚本生成视频）运行 ===')
const runs = db
  .prepare(
    `SELECT id, definition_id, status, created_at, finished_at FROM workflow_runs
     WHERE definition_id LIKE '%script-to-video%' ORDER BY created_at DESC LIMIT 5`,
  )
  .all()
for (const r of runs) console.log(JSON.stringify(r))

if (runs[0]) {
  const row = db.prepare('SELECT start_inputs FROM workflow_runs WHERE id = ?').get(runs[0].id)
  console.log('\n最近一次 start_inputs（复用其中的 provider/voice/模型 id）：')
  console.log(row.start_inputs)
}

console.log('\n=== 音色 ===')
for (const [t, sql] of [
  ['cloned_voices', 'SELECT id, name FROM cloned_voices LIMIT 8'],
  ['designed_voices', 'SELECT id, name FROM designed_voices LIMIT 8'],
]) {
  try {
    for (const v of db.prepare(sql).all()) console.log(t, JSON.stringify(v))
  } catch (e) {
    console.log(t, 'ERR ' + e.message)
  }
}

console.log('\n=== 工具凭据 ===')
try {
  for (const c of db.prepare('SELECT id, name, base_url, created_at FROM tool_credentials').all()) console.log(JSON.stringify(c))
} catch (e) {
  console.log('ERR ' + e.message)
}

console.log('\n=== Provider 配置（文本/图像/视频/语音可用 id）===')
for (const p of db
  .prepare('SELECT id, template_id, name, is_enabled FROM provider_configs WHERE deleted_at IS NULL ORDER BY created_at')
  .all()) {
  console.log(JSON.stringify(p))
}

db.close()