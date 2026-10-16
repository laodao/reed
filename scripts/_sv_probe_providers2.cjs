/**
 * 一次性排查脚本（只读）：provider_configs / search_engine_configs / tool_credentials 概览
 */
const Database = require('better-sqlite3')
const dbPath = process.argv[2] || 'C:/Users/daoge/AppData/Roaming/the_bot/the_bot.db'
const db = new Database(dbPath, { readonly: true, fileMustExist: true })

const cols = (t) => new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name))

console.log('=== provider_configs 列 ===', [...cols('provider_configs')].join(','))
for (const r of db.prepare('SELECT * FROM provider_configs').all()) {
  const o = { ...r }
  for (const k of ['api_key', 'apiKey', 'secret', 'config_json', 'config']) {
    if (o[k]) o[k] = String(o[k]).slice(0, 160)
  }
  console.log(JSON.stringify(o))
}

console.log('\n=== search_engine_configs 列 ===', [...cols('search_engine_configs')].join(','))
for (const r of db.prepare('SELECT * FROM search_engine_configs').all()) {
  const o = { ...r }
  for (const k of Object.keys(o)) if (/key|secret|token/i.test(k) && o[k]) o[k] = String(o[k]).slice(0, 20) + '…'
  console.log(JSON.stringify(o))
}

console.log('\n=== tool_credentials 列 ===', [...cols('tool_credentials')].join(','))
for (const r of db.prepare('SELECT * FROM tool_credentials').all()) {
  const o = { ...r }
  for (const k of Object.keys(o)) if (/key|secret|token|value|data/i.test(k) && o[k]) o[k] = String(o[k]).slice(0, 24) + '…'
  console.log(JSON.stringify(o))
}

db.close()