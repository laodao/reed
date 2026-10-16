/**
 * 一次性修复脚本：科幻空间（32ff5af0）被 max_steps 掐断的落库轮补齐。
 * 数据源 = dl_plan 已确认 payload（13 分支 / 80 知识点）；只补缺失，不动已有行。
 * 产物 = outputs/_dl-repair.sql（人工审后由 sqlite3 执行）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const PID = '32ff5af0-0ab5-45c8-bc1d-841463e3c28a'
const USER = 'local-default-user'
const payload = JSON.parse(readFileSync('C:/Users/daoge/code/project/the-bot/outputs/_dl-syllabus-payload.json', 'utf8'))
const existing = readFileSync('C:/Users/daoge/code/project/the-bot/outputs/_dl-existing.tsv', 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => {
    const [id, parentId, name] = l.split('\t')
    return { id, parentId: parentId || null, name }
  })

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
// 库内 DATETIME 存本地墙钟字符串（TypeORM better-sqlite3 口径），ts 是 UTC 瞬时 → +8h 后取 ISO 字段
const localStr = (t) => new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 23).replace('T', ' ')
const concepts = []
let seq = 0
// created_at 基准：晚于现有全部行（16:53:11），保证分支内排在已有兄弟之后、且按 payload 顺序
let ts = Date.UTC(2026, 9, 4, 8, 53, 30) // UTC → 本地 16:53:30

const sql = ['PRAGMA busy_timeout=15000;', 'BEGIN;']
const nameToId = new Map(existing.map((r) => [r.name, r.id]))
let inserted = 0, edges = 0

for (const b of payload.branches ?? []) {
  const group = existing.find((r) => r.name === b.name && r.parentId)
  if (!group) { console.error(`!! 分支目录缺失：${b.name}`); process.exit(1) }
  for (const c of b.concepts ?? []) {
    const dup = existing.find((r) => r.name === c.name && r.parentId === group.id)
    if (dup) continue
    const elsewhere = existing.find((r) => r.name === c.name) || concepts.find((x) => x.name === c.name)
    if (elsewhere) { console.error(`!! 异父同名，跳过（需人工裁决）：${c.name}`); continue }
    const id = randomUUID()
    const attrs = {}
    if (c.layer != null) attrs.layer = c.layer
    const declared = (c.prerequisites ?? []).filter((p) => p && p !== c.name)
    if (declared.length) attrs.prerequisites = declared
    ts += ++seq
    const at = localStr(ts)
    sql.push(
      `INSERT INTO dl_concept (id, user_id, project_id, node_type, name, en, parent_id, definition_short, research_state, mastery, source, attrs, card_id, note, created_at, updated_at) VALUES (` +
      `${q(id)}, ${q(USER)}, ${q(PID)}, 'concept', ${q(c.name)}, NULL, ${q(group.id)}, ` +
      `${q(c.definitionShort ?? '')}, 'extracted', 'untouched', 'ai_verified', ` +
      `${q(JSON.stringify(attrs))}, NULL, NULL, ${q(at)}, ${q(at)});`,
    )
    concepts.push({ id, name: c.name, layer: c.layer, declared })
    nameToId.set(c.name, id)
    inserted++
  }
}

// 前置边：payload 声明 + 两端都在图上 + 三元组不重复
const triples = readFileSync('C:/Users/daoge/code/project/the-bot/outputs/_dl-relations.tsv', 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => l.split('\t').join('|'))
const tset = new Set(triples)
ts += 1000
for (const c of concepts) {
  for (const p of c.declared ?? []) {
    const sid = nameToId.get(p)
    if (!sid) { console.error(`   前置无落点，跳过边：${c.name} ← ${p}`); continue }
    const key = `${PID}|${sid}|${c.id}|prerequisite`
    if (tset.has(key)) continue
    tset.add(key)
    ts += 1
    const at = localStr(ts)
    sql.push(
      `INSERT INTO dl_relation (id, user_id, project_id, source_id, target_id, relation_type, evidence, verified, created_at) VALUES (` +
      `${q(randomUUID())}, ${q(USER)}, ${q(PID)}, ${q(sid)}, ${q(c.id)}, 'prerequisite', ` +
      `${q(`已确认知识体系：${c.name} layer${c.layer ?? '?'} 前置=${p}`)}, 0, ${q(at)});`,
    )
    edges++
  }
}
sql.push('COMMIT;')
writeFileSync('C:/Users/daoge/code/project/the-bot/outputs/_dl-repair.sql', sql.join('\n'), 'utf8')
console.log(`待插入概念 ${inserted} 个，前置边 ${edges} 条 → outputs/_dl-repair.sql`)
