// 探针：对比「深度学习」空间前后两轮生成方式——第一轮(09-10 建空间) vs 后续补齐(09-12)
const Database = require('better-sqlite3')
const db = new Database('C:/Users/daoge/the-bot/the_bot.db', { readonly: true })

const SPACE = 'a13eb877-bf6d-4546-bc43-d08fc010367a'

const rows = db
  .prepare(
    `select rowid, scope_key, kind, name, payload_json, created_at
     from agent_trajectories
     where scope_key like ?
     order by rowid`
  )
  .all(`%${SPACE}%`)

console.log('总轨迹行数', rows.length)

// 1) 各轮次的 systemPrompt（看当时用的任务指令）
console.log('\n===== 各轮 systemPrompt（按时间，仅首条/变化时打印）=====')
let lastPrompt = ''
for (const r of rows) {
  let p
  try {
    p = JSON.parse(r.payload_json)
  } catch {
    continue
  }
  if (p.systemPrompt && p.systemPrompt !== lastPrompt) {
    lastPrompt = p.systemPrompt
    console.log(`\n--- [${r.created_at}] scope_key=${r.scope_key}`)
    console.log(p.systemPrompt.slice(0, 2600))
  }
}

// 2) 所有 decision 的 thought（模型自述的阶段与判断）
console.log('\n\n===== 模型的阶段性自述（thought）=====')
for (const r of rows) {
  let p
  try {
    p = JSON.parse(r.payload_json)
  } catch {
    continue
  }
  if (r.kind === 'decision' && p.thought && p.thought.trim()) {
    console.log(`[${r.created_at}] ${p.thought.replace(/\s+/g, ' ').slice(0, 300)}`)
  }
}

// 3) 写库调用：概念/关系/卡片
console.log('\n\n===== 写库动作（工具名 + 关键参数）=====')
for (const r of rows) {
  let p
  try {
    p = JSON.parse(r.payload_json)
  } catch {
    continue
  }
  if (r.kind !== 'tool_call') continue
  const name = r.name || ''
  if (!/dl_save_concept|dl_save_relation|dl_save_card/.test(name)) continue
  const a = p.args || {}
  if (/dl_save_concept/.test(name)) {
    const c = a.concept || {}
    console.log(`[${r.created_at}] +概念 ${c.name} | parent=${c.parentId || '-'} | 定义=${String(c.definitionShort || '').slice(0, 60)}`)
  } else if (/dl_save_relation/.test(name)) {
    const rel = a.relation || {}
    console.log(`[${r.created_at}] +关系 ${rel.relationType} ${rel.sourceId} -> ${rel.targetId}`)
  } else {
    const c = a.card || {}
    console.log(`[${r.created_at}] +讲义 conceptId=${c.conceptId} 区数=${(c.sections || []).length}`)
  }
}
