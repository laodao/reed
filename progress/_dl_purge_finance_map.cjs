/**
 * 一次性数据清理：清空「金融理财」学习空间的整张知识地图
 *
 * 背景（2026-09-13 用户指令「领域学习模块，把金融理财主题中的知识点全部清空」）：
 * 经确认，范围 = 整个地图全清——13 个节点（领域根 + 4 个主题分组 + 8 个知识点）
 * 一并删除，空间本体（dl_project：名称/目标/描述/前置要求）保留。
 *
 * 口径：
 * - dl_concept   删本空间全部节点（13 行，含 group 与领域根）；
 * - dl_relation  删本空间全部关系边（12 行，避免指向已删节点的悬挂边）；
 * - dl_card      删本空间全部讲义卡（2 行，均挂在「单利与复利」下）;
 * - dl_question/dl_note/dl_mastery_log/dl_doc/dl_plan 本空间本来就 0 行——脚本前置断言
 *   必须为 0，不为 0 则终止（避免留下指向已删概念的孤儿行，交人工决策）；
 * - dl_project   一行不动（空间不进 archived，仍是 active）。
 *
 * 删除后空间进入应用明确支持的空态（「空主题起步态」），可重新走
 * 起步研究/方案确认流程重建地图。
 *
 * 用法：
 *   dry-run（默认，只打印）：ELECTRON_RUN_AS_NODE=1 electron progress/_dl_purge_finance_map.cjs
 *   实际删除：              ELECTRON_RUN_AS_NODE=1 electron progress/_dl_purge_finance_map.cjs --apply
 */
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const DB_PATH = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const APPLY = process.argv.includes('--apply')

const SPACE = '5d586839-607f-4d57-b8d5-a0b51b276586'
const SPACE_NAME = '金融理财'

/** 清理前取证到的节点清单（id → 名称）：脚本按 id 集合断言，防止误删别的空间 */
const EXPECTED_NODES = {
  'b93b27d8-20d7-4aac-863e-781d24f07e19': '金融理财·领域根',
  '6e21c33b-8d98-4103-8705-083575bbccf2': '理财地基（记账·计息·三要素）',
  'd4878564-06e9-4da9-9e7e-a536bb889029': '家底与防线（应急金·负债·净值·保险）',
  '8d65c356-fe2a-44d0-8bef-b537a8d370d3': '时间与风险（现值·通胀·风险）',
  '86702610-f1b6-4365-81c7-5c0d4937bc3b': '投资与配置（配置·指数基金·定投）',
  '20ef818f-e222-44c7-a445-cb3621633552': '个人现金流与月度结余',
  'cca0820f-f106-42ac-a3f1-abf412bdef86': '单利与复利',
  '88326170-3447-451f-bf11-c66e338283d7': '货币的时间价值（现值与终值）',
  'a0c421a4-933e-46c2-bafe-4cca6528ef1f': '通货膨胀与货币购买力',
  '8b6ef8a6-c254-4753-9976-8fd15269236c': '收益·风险·流动性（理财三要素）',
  '1e2d9b39-0f5d-44a8-80b8-ed7399c5820f': '个人净值与资产负债表',
  '7e4a2b58-6a5c-4faf-ba19-c6c0c8ee009c': '应急储备金',
  '4c03f381-11cd-4a0f-948d-e01cc87fddcf': '负债与利息成本管理',
}
/** 删除前取证到的计数（不一致即终止） */
const EXPECTED_RELATIONS = 12
const EXPECTED_CARDS = 2

const db = new Database(DB_PATH)
db.pragma('busy_timeout = 15000')

const fail = (msg) => {
  console.error(`[purge-finance] 终止：${msg}`)
  db.close()
  process.exit(1)
}

// ---------- 前置断言 ----------
const space = db.prepare('SELECT * FROM dl_project WHERE id=?').get(SPACE)
if (!space) fail(`找不到空间 ${SPACE}`)
if (space.name !== SPACE_NAME) fail(`空间名不符：期望「${SPACE_NAME}」，实际「${space.name}」——防止 id 漂移误删`)

const concepts = db.prepare('SELECT * FROM dl_concept WHERE project_id=?').all(SPACE)
const nameById = new Map(concepts.map((c) => [c.id, c.name]))
const missing = Object.keys(EXPECTED_NODES).filter((id) => !nameById.has(id))
const extra = concepts.filter((c) => !(c.id in EXPECTED_NODES)).map((c) => `${c.name}(${c.id})`)
if (missing.length || extra.length) {
  fail(
    `节点集合与清理前取证不一致（缺失 ${missing.length} 个：${missing.join(',') || '无'}；多出 ${extra.length} 个：${extra.join(',') || '无'}）——空间可能已被改动，请重新取证`,
  )
}
for (const [id, name] of Object.entries(EXPECTED_NODES)) {
  if (nameById.get(id) !== name) fail(`节点名漂移：${id} 期望「${name}」实际「${nameById.get(id)}」`)
}

const relationCount = db.prepare('SELECT COUNT(*) n FROM dl_relation WHERE project_id=?').get(SPACE).n
const cardCount = db.prepare('SELECT COUNT(*) n FROM dl_card WHERE project_id=?').get(SPACE).n
if (relationCount !== EXPECTED_RELATIONS) fail(`关系边计数不符：期望 ${EXPECTED_RELATIONS}，实际 ${relationCount}`)
if (cardCount !== EXPECTED_CARDS) fail(`讲义卡计数不符：期望 ${EXPECTED_CARDS}，实际 ${cardCount}`)

/** 本空间应为 0 的表：不为 0 则终止（需人工确认这些行怎么处理） */
const ZERO_TABLES = ['dl_question', 'dl_note', 'dl_mastery_log', 'dl_doc', 'dl_plan']
for (const t of ZERO_TABLES) {
  const n = db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE project_id=?`).get(SPACE).n
  if (n !== 0) fail(`${t} 本空间有 ${n} 行（预期 0）——需要人工确认这些数据是否一并删除`)
}

// ---------- 打印删除清单 ----------
console.log(`[purge-finance] 库：${DB_PATH}`)
console.log(`[purge-finance] 空间：${space.name} (${space.id}) status=${space.status} created=${space.created_at}`)
console.log(`[purge-finance] 空间本体保留：goal/description/prerequisites 一行不动`)

console.log(`\n[purge-finance] 将删除 ${concepts.length} 个节点（dl_concept）：`)
for (const c of concepts) {
  console.log(
    `  ${c.node_type === 'group' ? '▸' : ' '} ${c.name}  [${c.node_type}] research=${c.research_state} mastery=${c.mastery}`,
  )
}
console.log(`\n[purge-finance] 将删除关系边 ${relationCount} 条（dl_relation）`)
console.log(`[purge-finance] 将删除讲义卡 ${cardCount} 张（dl_card）：`)
for (const k of db
  .prepare('SELECT id,concept_id,version,status FROM dl_card WHERE project_id=? ORDER BY concept_id,version')
  .all(SPACE)) {
  console.log(`  ${nameById.get(k.concept_id)} v${k.version} ${k.status} id=${k.id}`)
}
console.log(
  `\n[purge-finance] 保持为 0（已断言）：${ZERO_TABLES.map((t) => `${t.replace('dl_', '')}=0`).join('、')}`,
)

if (!APPLY) {
  console.log('\n[purge-finance] dry-run 结束：未写库。加 --apply 实际执行。')
  db.close()
  process.exit(0)
}

// ---------- 在线备份（一致快照，不受并发写影响） ----------
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
const backupPath = path.join(path.dirname(DB_PATH), `the_bot.db.bak-purgeFinanceMap-${stamp}`)
db.prepare('VACUUM INTO ?').run(backupPath)
console.log(`\n[purge-finance] 已备份：${backupPath}（${(fs.statSync(backupPath).size / 1024 / 1024).toFixed(1)} MB）`)

// ---------- 事务内删除 ----------
const run = db.transaction(() => {
  // 先删叶子数据再删节点，避免中途出现悬挂引用
  const cards = db.prepare('DELETE FROM dl_card WHERE project_id=?').run(SPACE)
  const relations = db.prepare('DELETE FROM dl_relation WHERE project_id=?').run(SPACE)
  const nodes = db.prepare('DELETE FROM dl_concept WHERE project_id=?').run(SPACE)
  return { cards: cards.changes, relations: relations.changes, nodes: nodes.changes }
})
const result = run()
console.log(
  `[purge-finance] 完成：删除节点 ${result.nodes} 个、关系边 ${result.relations} 条、讲义卡 ${result.cards} 张`,
)

// ---------- 自检 ----------
const leftNodes = db.prepare('SELECT COUNT(*) n FROM dl_concept WHERE project_id=?').get(SPACE).n
const leftRel = db.prepare('SELECT COUNT(*) n FROM dl_relation WHERE project_id=?').get(SPACE).n
const leftCards = db.prepare('SELECT COUNT(*) n FROM dl_card WHERE project_id=?').get(SPACE).n
const stillThere = db.prepare('SELECT name,goal,status,description,prerequisites FROM dl_project WHERE id=?').get(SPACE)
console.log(
  `[purge-finance] 自检：concept=${leftNodes} relation=${leftRel} card=${leftCards}；空间本体=${stillThere ? `${stillThere.name} status=${stillThere.status}` : '丢失！'}`,
)
if (leftNodes || leftRel || leftCards || !stillThere) {
  console.error('[purge-finance] 自检不通过——请用备份回滚并排查')
  db.close()
  process.exit(1)
}
db.close()
