/**
 * 一次性排查脚本（只读）：V3 视频工作流相关的 provider 配置 / 凭据 / 自定义工具
 * 用法：node scripts/_sv_probe_providers.cjs [dbPath]
 */
const Database = require('better-sqlite3')

const dbPath = process.argv[2] || 'C:/Users/daoge/AppData/Roaming/the_bot/the_bot.db'
const db = new Database(dbPath, { readonly: true, fileMustExist: true })

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all()
  .map((r) => r.name)

console.log('=== 相关表 ===')
console.log(tables.filter((t) => /provider|credential|tool|search|image|video|voice|asset|workflow/i.test(t)).join(', '))

const show = (label, sql, params = []) => {
  console.log(`\n=== ${label} ===`)
  try {
    const rows = db.prepare(sql).all(...params)
    if (!rows.length) return console.log('（空）')
    for (const r of rows) console.log(JSON.stringify(r))
  } catch (e) {
    console.log('ERR: ' + e.message)
  }
}

show(
  'provider_config',
  "SELECT * FROM provider_config",
)
show('provider 表清单', "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%provider%'")
show('credential 表', "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%credential%'")
show('custom_tools', 'SELECT * FROM custom_tools')
show('search_engine 配置', "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%search%'")
show('app_settings', 'SELECT * FROM app_settings')
show('settings', 'SELECT * FROM settings')

db.close()