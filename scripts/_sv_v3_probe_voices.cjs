/** 只读探针：隔离库里的视频/图像 provider 配置、音色与历史 run 的 voiceId 用法 */
const Database = require('better-sqlite3')
const db = new Database('C:/Users/daoge/code/project/the-bot/.local/sv-v3/userData/the_bot.db', {
  readonly: true,
  fileMustExist: true,
})

console.log('=== provider_configs（全量）===')
for (const p of db
  .prepare('SELECT id, template_id, name, base_url, image_base_url, video_base_url, is_enabled, deleted_at FROM provider_configs')
  .all()) {
  console.log(JSON.stringify(p))
}

for (const t of ['image_providers', 'video_providers', 'voice_providers']) {
  console.log(`\n=== ${t} ===`)
  try {
    console.log(db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name).join(','))
    for (const r of db.prepare(`SELECT * FROM ${t} LIMIT 5`).all()) console.log(JSON.stringify(r).slice(0, 400))
  } catch (e) {
    console.log('ERR ' + e.message)
  }
}

console.log('\n=== 历史 run 里出现过的 voiceId / videoProviderConfigId ===')
const rows = db
  .prepare("SELECT id, definition_id, start_inputs FROM workflow_runs ORDER BY created_at DESC LIMIT 40")
  .all()
for (const r of rows) {
  let j = {}
  try {
    j = JSON.parse(r.start_inputs || '{}')
  } catch {
    /* ignore */
  }
  const bits = []
  for (const k of ['voiceId', 'voiceProviderConfigId', 'videoProviderConfigId', 'videoModelId', 'imageProviderConfigId', 'imageModelId', 'videoQuality', 'h3Steps']) {
    if (j[k] !== undefined) bits.push(`${k}=${JSON.stringify(j[k])}`)
  }
  if (bits.length) console.log(r.definition_id, '|', bits.join(' | '))
}

console.log('\n=== voice_records / designed_voices 全量（音色候选）===')
for (const t of ['designed_voices', 'cloned_voices']) {
  try {
    for (const v of db.prepare(`SELECT * FROM ${t}`).all()) console.log(t, JSON.stringify(v).slice(0, 300))
  } catch (e) {
    console.log(t, 'ERR ' + e.message)
  }
}

db.close()