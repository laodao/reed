/**
 * 只读：列出 provider_configs（找 vLLM 提供商与 qwen 模型 id，配置知识生成默认模型用）
 * 运行: ELECTRON_RUN_AS_NODE=1 electron progress/_provider_probe.cjs [dbPath]
 */
const Database = require('better-sqlite3')
const dbPath = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const db = new Database(dbPath, { readonly: true })

const has = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='provider_configs'").get()
console.log('[provider] 表存在:', has)
if (!has) {
  db.close()
  process.exit(0)
}
const cols = db.prepare('PRAGMA table_info(provider_configs)').all().map((c) => c.name)
const rows = db.prepare('SELECT * FROM provider_configs').all()

// vllm 提供商的身份字段（找 api key / token 列；密钥加密存，只打前缀）
for (const r of rows) {
  if (!/vllm/i.test(r.name || '')) continue
  console.log('[provider] vllm 行身份字段：')
  for (const k of Object.keys(r)) {
    if (k === 'models') continue
    let v = r[k]
    if (v && typeof v === 'string' && v.length > 30) v = `${v.slice(0, 10)}…(len=${v.length})`
    console.log('  ', k, '=', v)
  }
}

console.log(`[provider] 行数=${rows.length}`)
for (const r of rows) {
  console.log('---')
  console.log('id:', r.id)
  console.log('name:', r.name)
  console.log('provider_type:', r.provider_type)
  console.log('base_url:', r.base_url)
  console.log('is_default:', r.is_default)
  console.log('default_model:', r.default_model)
  console.log('image_base_url:', r.image_base_url)
  console.log('models:', r.models)
}
// 有没有默认提供商设置（roles / settings 里）
for (const t of ['roles', 'settings']) {
  const ok = !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${t}'`).get()
  if (!ok) continue
  console.log(`[provider] ${t} 行数:`, db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c)
}
db.close()