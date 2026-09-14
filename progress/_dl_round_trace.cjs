/**
 * 只读：取某空间下 agent 轮次的轨迹与工具调用（按真实列名精确过滤）
 * 运行: ELECTRON_RUN_AS_NODE=1 electron progress/_dl_round_trace.cjs [spaceId]
 */
const Database = require('better-sqlite3')

const SPACE = process.argv[2] || '5d586839-607f-4d57-b8d5-a0b51b276586'
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })

const DOMAIN_TERMS = ['股票', '期货', '债券', '美元', '做空', '做多', 'MBS', '财报', '行情', '外汇', '基金', '指数', 'ETF']
const LIMIT_MARKERS = ['上限拦截', 'maxCalls', 'LIMIT_EXCEEDED', '步数上限', 'max_steps', 'maxSteps', '被阻断']

const q = (sql, ...args) => {
  try {
    return db.prepare(sql).all(...args)
  } catch (e) {
    console.log(`  (查询失败: ${e.message})`)
    return []
  }
}

// ---------- 1. 轨迹 ----------
const traj = q('SELECT rowid,* FROM agent_trajectories WHERE scope_key LIKE ? OR scope LIKE ? ORDER BY rowid', `%${SPACE}%`, `%${SPACE}%`)
console.log(`===== agent_trajectories 命中 ${traj.length} 行 =====`)
const kinds = new Map()
for (const r of traj) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1)
console.log('  kind 分布:', [...kinds.entries()].map(([k, v]) => `${k}=${v}`).join(', '))
if (traj.length) console.log(`  时间跨度: ${traj[0].created_at} → ${traj[traj.length - 1].created_at}`)
for (const r of traj) {
  const text = String(r.payload_json || '')
  const terms = DOMAIN_TERMS.filter((x) => text.includes(x))
  console.log(`  [${r.created_at}] rowid=${r.rowid} kind=${r.kind} name=${r.name} iter=${r.iteration} len=${text.length} tokens=${r.prompt_tokens}/${r.completion_tokens}${terms.length ? ` 命中域词:${terms.join('/')}` : ''}`)
  if (/assistant|final|summary|plan|thought/i.test(String(r.kind))) {
    const m = /"content"\s*:\s*"((?:[^"\\]|\\.){0,900})/.exec(text)
    console.log(`      文本: ${(m ? m[1] : text).slice(0, 800).replace(/\\n/g, ' ')}`)
  }
}

// ---------- 2. 工具调用 ----------
const calls = q('SELECT rowid,* FROM agent_tool_calls WHERE session_key LIKE ? ORDER BY rowid', `%${SPACE}%`)
console.log(`\n===== agent_tool_calls 命中 ${calls.length} 行 =====`)
if (calls.length) {
  const byTool = new Map()
  for (const r of calls) byTool.set(r.tool_name, (byTool.get(r.tool_name) ?? 0) + 1)
  console.log('  按工具计数:', [...byTool.entries()].map(([k, v]) => `${k}=${v}`).join(', '))
  console.log(`  时间跨度: ${calls[0].created_at} → ${calls[calls.length - 1].created_at}`)
  const limited = calls.filter((r) => LIMIT_MARKERS.some((m) => `${r.result_preview}${r.args_preview}${r.error_code}`.includes(m)))
  console.log(`  命中"上限/阻断"标记: ${limited.length} 条`)
  for (const r of limited.slice(0, 8)) console.log(`    [${r.created_at}] ${r.tool_name} ${r.status} ${r.error_code ?? ''} → ${String(r.result_preview).slice(0, 200).replace(/\s+/g, ' ')}`)
  console.log('  全部调用时间线:')
  for (const r of calls) {
    console.log(`    [${r.created_at}] ${r.status.padEnd(7)} ${r.tool_name}${r.truncated ? ' (truncated)' : ''} args=${String(r.args_preview).slice(0, 130).replace(/\s+/g, ' ')}`)
  }
}

// ---------- 3. 产物/事件 ----------
const arts = q('SELECT rowid,* FROM agent_tool_artifacts WHERE scope_key LIKE ? ORDER BY rowid', `%${SPACE}%`)
console.log(`\n===== agent_tool_artifacts 命中 ${arts.length} 行 =====`)
for (const a of arts.slice(0, 10)) console.log(`  [${a.created_at}] ${a.tool_name} len=${String(a.payload_json).length}`)

const conv = q("SELECT id,conversation_id,seq,role,substr(content,1,200) AS head,created_at FROM agent_sessions WHERE conversation_id LIKE ? ORDER BY seq", `%${SPACE}%`)
console.log(`\n===== agent_sessions（按 conversation_id）命中 ${conv.length} 行 =====`)
for (const r of conv) console.log(`  [${r.created_at}] #${r.seq} ${r.role}: ${String(r.head).replace(/\s+/g, ' ')}`)
db.close()
