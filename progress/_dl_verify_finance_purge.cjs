/**
 * 独立只读复核：金融理财空间知识地图是否已清空、空间本体是否完好、其他空间是否未受影响
 * 用法：ELECTRON_RUN_AS_NODE=1 electron progress/_dl_verify_finance_purge.cjs [dbPath]
 * 断言不通过则退出码 1。
 */
const Database = require('better-sqlite3')

const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const SPACE = '5d586839-607f-4d57-b8d5-a0b51b276586'
/** 本次删除的 13 个节点 id（删除后全库任何 dl_* 行都不应再引用它们） */
const DELETED = [
  'b93b27d8-20d7-4aac-863e-781d24f07e19',
  '6e21c33b-8d98-4103-8705-083575bbccf2',
  'd4878564-06e9-4da9-9e7e-a536bb889029',
  '8d65c356-fe2a-44d0-8bef-b537a8d370d3',
  '86702610-f1b6-4365-81c7-5c0d4937bc3b',
  '20ef818f-e222-44c7-a445-cb3621633552',
  'cca0820f-f106-42ac-a3f1-abf412bdef86',
  '88326170-3447-451f-bf11-c66e338283d7',
  'a0c421a4-933e-46c2-bafe-4cca6528ef1f',
  '8b6ef8a6-c254-4753-9976-8fd15269236c',
  '1e2d9b39-0f5d-44a8-80b8-ed7399c5820f',
  '7e4a2b58-6a5c-4faf-ba19-c6c0c8ee009c',
  '4c03f381-11cd-4a0f-948d-e01cc87fddcf',
]
/**
 * 清理前各空间节点数（探针取证）。「验收·贝叶斯入门」此刻有在途研究轮在写库（494 → 持续增长），
 * 不参与"不变"断言，只记录；其余空间必须一字不差。
 */
const SPACE_NODES_BEFORE = {
  量子物理: 7,
  走查起步主题: 6,
  Atlas空态验证: 1,
  M7技能验证: 6,
  深度学习: 18,
}

const db = new Database(DB_PATH, { readonly: true })
const problems = []
const check = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) problems.push(msg)
}

console.log(`库：${DB_PATH}\n`)

console.log('① 本空间各 dl_* 表行数应归零')
for (const t of [
  'dl_concept',
  'dl_relation',
  'dl_card',
  'dl_question',
  'dl_note',
  'dl_mastery_log',
  'dl_doc',
  'dl_plan',
]) {
  const n = db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE project_id=?`).get(SPACE).n
  check(n === 0, `${t}: ${n} 行`)
}

console.log('\n② 空间本体（dl_project）应完好、字段未被改动')
const p = db.prepare('SELECT * FROM dl_project WHERE id=?').get(SPACE)
check(!!p, '空间行仍存在')
if (p) {
  check(p.name === '金融理财', `name=${p.name}`)
  check(p.status === 'active', `status=${p.status}`)
  check(!!p.goal && p.goal === '工作应用', `goal=${p.goal}`)
  check((p.description || '').length > 50, `description 保留（${(p.description || '').length} 字）`)
  const pre = JSON.parse(p.prerequisites || '[]')
  check(pre.length === 4, `prerequisites 保留 ${pre.length} 条`)
}

console.log('\n③ 全库反查：13 个已删节点 id 是否仍被任何 dl_* 行引用')
const REF_COLUMNS = {
  dl_concept: ['id', 'parent_id', 'card_id'],
  dl_relation: ['source_id', 'target_id'],
  dl_card: ['concept_id'],
  dl_question: ['concept_id'],
  dl_note: ['concept_id'],
  dl_mastery_log: ['concept_id'],
  dl_doc: ['concept_ids'],
  dl_plan: ['project_id'],
}
let dangling = 0
for (const [t, cols] of Object.entries(REF_COLUMNS)) {
  for (const c of cols) {
    if (c === 'project_id') continue
    for (const id of DELETED) {
      let n = 0
      try {
        n = db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${c} LIKE ?`).get(`%${id}%`).n
      } catch {
        continue
      }
      if (n) {
        dangling += n
        console.log(`  ✗ ${t}.${c} 仍引用 ${id}：${n} 行`)
      }
    }
  }
}
check(dangling === 0, `残留引用 ${dangling} 处`)

console.log('\n④ 其他空间规模应与清理前一致（贝叶斯入门有在途研究轮，仅记录）')
for (const s of db.prepare('SELECT id,name FROM dl_project ORDER BY created_at').all()) {
  const n = db.prepare('SELECT COUNT(*) n FROM dl_concept WHERE project_id=?').get(s.id).n
  if (s.name === '金融理财') {
    check(n === 0, `${s.name}: 节点 ${n}`)
  } else if (s.name in SPACE_NODES_BEFORE) {
    check(n === SPACE_NODES_BEFORE[s.name], `${s.name}: 节点 ${n}（清理前 ${SPACE_NODES_BEFORE[s.name]}）`)
  } else {
    console.log(`  · ${s.name}: 节点 ${n}（在途轮次写入中，不参与断言）`)
  }
}

console.log('\n⑤ 本空间相关悬挂引用应为 0（存量问题另见 _dl_probe_orphans.cjs 备份对照）')
const finOrphans = db
  .prepare(
    `SELECT COUNT(*) n FROM dl_relation r
     WHERE r.project_id = ?
       AND (NOT EXISTS (SELECT 1 FROM dl_concept c WHERE c.id = r.source_id)
         OR NOT EXISTS (SELECT 1 FROM dl_concept c WHERE c.id = r.target_id))`,
  )
  .get(SPACE).n
const finCardOrphans = db
  .prepare(
    `SELECT COUNT(*) n FROM dl_card k
     WHERE k.project_id = ? AND NOT EXISTS (SELECT 1 FROM dl_concept c WHERE c.id = k.concept_id)`,
  )
  .get(SPACE).n
check(finOrphans === 0, `本空间悬挂关系边：${finOrphans} 条`)
check(finCardOrphans === 0, `本空间孤儿讲义卡：${finCardOrphans} 张`)

db.close()
console.log(problems.length ? `\n复核不通过：${problems.length} 项` : '\n复核通过：金融理财空间地图已清空，空间本体完好，其他空间未受影响')
process.exit(problems.length ? 1 : 0)
