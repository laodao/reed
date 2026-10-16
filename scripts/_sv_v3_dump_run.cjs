/**
 * 只读探针：导出某次运行的逐镜素材证据（来源/相关性/检索词/素材出处/本地路径）
 * 用法：ELECTRON_RUN_AS_NODE=1 electron.exe scripts/_sv_v3_dump_run.cjs [runId]
 */
const Database = require('better-sqlite3')
const fs = require('fs')
const db = new Database('C:/Users/daoge/code/project/the-bot/.local/sv-v3/userData/the_bot.db', {
  readonly: true,
  fileMustExist: true,
})

const runId =
  process.argv[2] ||
  db.prepare("SELECT id FROM workflow_runs WHERE definition_id LIKE '%script-to-video-v3%' ORDER BY created_at DESC LIMIT 1").get()?.id
if (!runId) {
  console.log('没有找到运行记录')
  process.exit(1)
}
console.log('runId =', runId)

const run = db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(runId)
console.log('status =', run.status, '| started', run.started_at, '| finished', run.finished_at, '| error', run.error || '(none)')

const nodes = db
  .prepare('SELECT node_id, status, output_json, error, started_at, finished_at FROM workflow_node_runs WHERE run_id = ? ORDER BY started_at')
  .all(runId)

const parse = s => {
  try {
    return JSON.parse(s || '{}')
  } catch {
    return {}
  }
}

console.log('\n=== 节点时间线 ===')
for (const n of nodes) {
  const out = parse(n.output_json)
  const extra = []
  if (n.node_id === 'matItem') {
    const r = out.result || out
    extra.push(`来源=${r.source} 相关性=${r.relevance} 检索词=${r.searchQuery || '-'}`)
  }
  if (n.node_id === 'segPlan') {
    const r = out.result || out
    extra.push(`片段=${r.count} H3=${r.h3Count}`)
  }
  console.log(`${n.node_id.padEnd(16)} ${String(n.status).padEnd(12)} ${extra.join(' ')}${n.error ? ' ERR:' + n.error : ''}`)
}

// 逐镜卡片（matItem 每次迭代一条）
console.log('\n=== 逐镜素材卡片 ===')
const cards = nodes
  .filter(n => n.node_id === 'matItem')
  .map(n => parse(n.output_json).result || parse(n.output_json))
const rows = []
for (const c of cards) {
  rows.push({
    cardIndex: c.cardIndex,
    source: c.source,
    relevance: c.relevance,
    searchQuery: c.searchQuery,
    provider: c.provider,
    stockId: c.stockId,
    pageUrl: c.pageUrl,
    author: c.author,
    license: c.license,
    duration: c.duration,
    caption: c.caption,
    concept: c.concept,
    subject: c.subject,
    setting: c.setting,
    imagePath: c.imagePath,
    clipPath: c.clipPath,
    note: c.note,
  })
}
rows.sort((a, b) => (a.cardIndex || 0) - (b.cardIndex || 0))
for (const r of rows) {
  console.log(
    `#${r.cardIndex} [${r.source}] rel=${r.relevance} ${r.duration}s | 主体=${r.subject || '-'} | 场所=${r.setting || '-'}\n` +
      `     检索词=${r.searchQuery || '-'} | ${r.provider || '-'}#${r.stockId || '-'} ${r.author || ''} | ${r.pageUrl || '-'}\n` +
      `     图=${r.imagePath || '-'}\n     片段=${r.clipPath || '-'}\n     说明=${String(r.note || '').slice(0, 200)}`,
  )
}

const board = nodes.find(n => n.node_id === 'boardReview')
if (board) {
  const payload = (parse(board.output_json).result || parse(board.output_json)).payload || {}
  console.log('\n=== 素材板摘要（boardReview payload.summary）===')
  console.log(String(payload.summary || '(空)'))
}

const seg = nodes.find(n => n.node_id === 'segments')
if (seg) {
  const s = parse(seg.output_json).result || parse(seg.output_json)
  console.log('\n=== 片段装配 ===')
  console.log(JSON.stringify(s.segments, null, 2))
}

const comp = nodes.find(n => n.node_id === 'comp1')
if (comp) {
  console.log('\n=== 成片 ===')
  console.log(JSON.stringify(parse(comp.output_json), null, 2))
}

fs.writeFileSync(
  'C:/Users/daoge/code/project/the-bot/outputs/_sv-v3-run-cards.json',
  JSON.stringify({ runId, status: run.status, rows, timeline: nodes.map(n => ({ id: n.node_id, status: n.status })) }, null, 2),
  'utf-8',
)
console.log('\n卡片已导出 outputs/_sv-v3-run-cards.json')
db.close()