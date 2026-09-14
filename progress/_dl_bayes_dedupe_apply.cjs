/**
 * 验收·贝叶斯入门 空间：去掉重复知识点（A 类：同名 / 同义异写，零争议）
 *
 * 语义 = 「合并」而不是「丢弃」：
 *   1. 每组保留一个节点（保留项见 GROUPS 首项）；
 *   2. 被删节点的关系边改挂到保留节点（三元组重复的合并、改挂后自环的丢弃）；
 *   3. 被删节点的答疑 / 笔记 / 掌握度记录改挂到保留节点（用户数据一条不丢）；
 *   4. 以被删节点为父目录的子节点改挂到保留节点；
 *   5. 若某一组的被删节点掌握度高于保留节点，保留节点提升到较高掌握度（不丢进度）；
 *   6. 最后删除被删节点的讲义卡与节点本体。
 *
 * 组由人工通读 499 个知识点后判定（同一知识点、仅名称/措辞不同），
 * 证据见 progress/_dl_bayes_dedupe_plan.cjs 的输出。
 *
 * 用法：
 *   预演（默认，只打印不改库）：ELECTRON_RUN_AS_NODE=1 electron progress/_dl_bayes_dedupe_apply.cjs
 *   实际执行：                  ELECTRON_RUN_AS_NODE=1 electron progress/_dl_bayes_dedupe_apply.cjs --apply
 */
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const DB_PATH = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const APPLY = process.argv.includes('--apply')
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'
const SPACE_NAME = '验收·贝叶斯入门'

/** A 类重复组（首项 = 保留）。同名不同大小写的「先验概率」按 id 单列。 */
const GROUPS = [
  ['KL 散度', 'KL 散度（KL divergence）', 'KL 散度（Kullback–Leibler 散度）', 'KL 散度（相对熵）'],
  ['Fisher 信息量', 'Fisher 信息'],
  ['得分函数（Score）', '得分函数'],
  ['马尔可夫链蒙特卡洛（MCMC）', 'MCMC', 'MCMC（马尔可夫链蒙特卡罗）', '马尔可夫链蒙特卡罗（MCMC）'],
  ['马尔可夫链（Markov Chain）', '马尔可夫链', '马尔可夫链（Markov chain）'],
  ['平稳分布', '平稳分布（不变分布）'],
  ['R̂（Gelman–Rubin 收敛诊断量）', 'R-hat（潜在尺度缩减因子）', '收敛诊断 R-hat'],
  ['有效样本量 ESS', '有效样本量（ESS）', '有效样本量（bulk-ESS / tail-ESS）'],
  ['秩图', '秩图（rank plot）'],
  ['自相关', '自相关（Autocorrelation）'],
  ['期望（数学期望）', '期望', '期望（Expectation）'],
  ['期望与方差', '期望与方差（Expectation and Variance）'],
  ['后验分布', '后验分布（Posterior distribution）'],
  ['后验一致性', '后验一致性（大样本集中）'],
  ['后验收缩率', '后验收缩速率'],
  ['贝叶斯方法论的开放问题', '贝叶斯统计的公开未决问题', '贝叶斯推断中的开放问题', '贝叶斯定理：定理已证，未决问题在其方法论层面'],
  ['Bernstein–von Mises 定理', 'Bernstein–von Mises 定理（正确指定下的经典版本）'],
  ['低差异序列（low-discrepancy sequence）', '低差异序列'],
  ['do-演算（do-calculus）', 'do-演算'],
  ['反事实', '反事实（counterfactual）'],
  ['变分推断（VI）', '变分推断'],
  ['测度（Measure / Probability measure）', '测度（Measure）'],
  ['经验贝叶斯（Empirical Bayes）', '经验贝叶斯'],
  ['非参数贝叶斯建模（应对误设的扩族路线）', '非参数贝叶斯建模'],
  ['随机变量与分布', '随机变量与概率分布'],
  ['三明治方差（sandwich variance）', '夹心方差（sandwich variance）'],
  ['导数与偏导数', '偏导数'],
  ['一元函数导数与求导法则', '导数与链式法则'],
  ['对数与指数函数', '对数与指数运算'],
  ['积分与求和记号（∫ 与 Σ）', '积分与求和记号'],
  ['狄利克雷过程', 'Dirichlet 过程'],
  ['模型错误指定（misspecification）', '模型错误指定'],
  ['分位数函数（Quantile function）', 'CDF 的广义逆（inf 定义）'],
  ['随机梯度（子采样梯度估计）', '小批量随机梯度', '随机梯度与数据子采样'],
  ['平均场假设', '平均场近似'],
  ['高斯过程', '高斯过程先验'],
  ['方差与标准差', '方差与样本方差'],
  ['蒙特卡洛估计量', '蒙特卡洛估计（Monte Carlo Estimation）'],
  ['大数定律', '依概率收敛与大数定律'],
  ['因果效应的可识别性', '可识别性'],
]

/** 同名（大小写不同）须按 id 指定的组 */
const ID_GROUPS = [
  {
    label: '先验概率（同名两个节点）',
    keepId: '16943f19-2e1f-46d0-981c-25d864f0b655',
    deleteIds: ['a286c945-5ccb-450f-b7ef-41b023b4cbd4'],
  },
]

const MASTERY_RANK = { untouched: 0, review: 1, learning: 2, mastered: 3 }

const db = new Database(DB_PATH)
db.pragma('busy_timeout = 15000')

const fail = (msg) => {
  console.error(`[dedupe] 终止：${msg}`)
  db.close()
  process.exit(1)
}

// ---------- 前置断言 ----------
const space = db.prepare('SELECT * FROM dl_project WHERE id=?').get(SPACE)
if (!space) fail(`找不到空间 ${SPACE}`)
if (space.name !== SPACE_NAME) fail(`空间名不符：期望「${SPACE_NAME}」实际「${space.name}」`)

const nodes = db.prepare('SELECT * FROM dl_concept WHERE project_id=?').all(SPACE)
const leaves = nodes.filter((n) => n.node_type !== 'group')
const byName = new Map()
for (const n of leaves) {
  if (!byName.has(n.name)) byName.set(n.name, [])
  byName.get(n.name).push(n)
}
const byId = new Map(nodes.map((n) => [n.id, n]))

// 解析分组
const groups = []
for (const names of GROUPS) {
  const members = []
  for (const name of names) {
    const hits = byName.get(name) || []
    if (hits.length !== 1) fail(`名称「${name}」命中 ${hits.length} 个节点，需按 id 指定`)
    members.push(hits[0])
  }
  groups.push({ label: names.join(' ⟷ '), members })
}
for (const g of ID_GROUPS) {
  const keeper = byId.get(g.keepId)
  if (!keeper) fail(`保留节点不存在：${g.keepId}`)
  const members = [keeper]
  for (const id of g.deleteIds) {
    const n = byId.get(id)
    if (!n) fail(`待删节点不存在：${id}`)
    members.push(n)
  }
  groups.push({ label: g.label, members })
}

const keepIds = new Set(groups.map((g) => g.members[0].id))
const deleteMap = new Map() // 被删 id → 保留 id
for (const g of groups) {
  for (const m of g.members.slice(1)) {
    if (keepIds.has(m.id)) fail(`节点 ${m.id} 同时出现在保留与删除集合`)
    deleteMap.set(m.id, g.members[0].id)
  }
}
if (deleteMap.size !== 52) fail(`待删节点数 ${deleteMap.size} ≠ 预期 52`)

// ---------- 影响面 ----------
const relations = db.prepare('SELECT * FROM dl_relation WHERE project_id=?').all(SPACE)
const questions = db.prepare('SELECT * FROM dl_question WHERE project_id=?').all(SPACE)
const notes = db.prepare('SELECT * FROM dl_note WHERE project_id=?').all(SPACE)
const logs = db.prepare('SELECT * FROM dl_mastery_log WHERE project_id=?').all(SPACE)
const cards = db.prepare('SELECT id,concept_id,version,status FROM dl_card WHERE project_id=?').all(SPACE)
const docs = db.prepare('SELECT COUNT(*) n FROM dl_doc WHERE project_id=?').get(SPACE).n
if (docs) fail(`本空间有 ${docs} 条 dl_doc，concept_ids 里的引用未纳入本次处理，请先人工确认`)

// 跨空间引用保护：被删节点不应出现在别的空间的关系里
const crossSpace = relations.filter((r) => r.project_id !== SPACE)
if (crossSpace.length) fail(`本空间关系表出现 ${crossSpace.length} 条异空间行`)

const childrenToReparent = nodes.filter((n) => n.parent_id && deleteMap.has(n.parent_id))
const cardsToDelete = cards.filter((c) => deleteMap.has(c.concept_id))
const relsTouched = relations.filter((r) => deleteMap.has(r.source_id) || deleteMap.has(r.target_id))
const qTouched = questions.filter((q) => q.concept_id && deleteMap.has(q.concept_id))
const nTouched = notes.filter((n) => n.concept_id && deleteMap.has(n.concept_id))
const lTouched = logs.filter((l) => deleteMap.has(l.concept_id))

// 掌握度提升（不丢进度）
const promotions = []
for (const g of groups) {
  const keeper = g.members[0]
  const best = g.members.reduce((a, b) => (MASTERY_RANK[b.mastery] > MASTERY_RANK[a.mastery] ? b : a))
  if (best.id !== keeper.id && MASTERY_RANK[best.mastery] > MASTERY_RANK[keeper.mastery]) {
    promotions.push({ keeper: keeper.name, from: keeper.mastery, to: best.mastery, source: best.name })
  }
}

console.log(`[dedupe] 库：${DB_PATH}`)
console.log(`[dedupe] 空间：${space.name}（节点 ${nodes.length} / 关系 ${relations.length} / 讲义 ${cards.length} / 答疑 ${questions.length} / 笔记 ${notes.length} / 掌握度 ${logs.length}）`)
console.log(`[dedupe] 分组 ${groups.length} 组，删除 ${deleteMap.size} 个重复知识点，保留 ${groups.length} 个\n`)

for (const g of groups) {
  const [keeper, ...dels] = g.members
  console.log(`· 保留「${keeper.name}」(边 ${relations.filter((r) => r.source_id === keeper.id || r.target_id === keeper.id).length})`)
  for (const d of dels) {
    const nr = relations.filter((r) => r.source_id === d.id || r.target_id === d.id).length
    const nk = cards.filter((c) => c.concept_id === d.id).length
    console.log(`    删「${d.name}」(边 ${nr} · 讲义 ${nk}${questions.some((q) => q.concept_id === d.id) ? ' · 有答疑' : ''}${notes.some((n) => n.concept_id === d.id) ? ' · 有笔记' : ''})`)
  }
}

console.log(`\n[dedupe] 合并影响面：`)
console.log(`  关系边：${relsTouched.length} 条涉及被删节点（改挂到保留节点，三元组重复的合并、自环丢弃）`)
console.log(`  答疑：${qTouched.length} 条改挂｜笔记：${nTouched.length} 条改挂｜掌握度记录：${lTouched.length} 条改挂`)
console.log(`  子节点改归属：${childrenToReparent.length} 个（父目录在被删之列）`)
console.log(`  讲义卡删除：${cardsToDelete.length} 张`)
console.log(`  掌握度提升：${promotions.length} 处${promotions.length ? ' —— ' + promotions.map((p) => `${p.keeper} ${p.from}→${p.to}`).join('；') : ''}`)

// 先算出改挂后的关系集合，供去重统计
const mapId = (id) => deleteMap.get(id) || id
const seen = new Map()
const nextRels = []
let selfLoops = 0
let merged = 0
for (const r of relations) {
  const s = mapId(r.source_id)
  const t = mapId(r.target_id)
  if (s === t) {
    selfLoops++
    continue
  }
  const key = `${s}|${t}|${r.relation_type}`
  if (seen.has(key)) {
    merged++
    continue
  }
  seen.set(key, true)
  nextRels.push({ ...r, source_id: s, target_id: t })
}
console.log(`  关系边结果：${relations.length} → ${nextRels.length}（自环丢弃 ${selfLoops}，三元组合并 ${merged}）`)

if (!APPLY) {
  console.log('\n[dedupe] dry-run 结束：未写库。加 --apply 实际执行。')
  db.close()
  process.exit(0)
}

// ---------- 备份 ----------
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
const backupPath = path.join(path.dirname(DB_PATH), `the_bot.db.bak-dedupeBayes-${stamp}`)
db.prepare('VACUUM INTO ?').run(backupPath)
console.log(`\n[dedupe] 已备份：${backupPath}（${(fs.statSync(backupPath).size / 1024 / 1024).toFixed(1)} MB）`)

// ---------- 事务写库 ----------
const now = new Date().toISOString().replace('T', ' ').slice(0, 23)
const run = db.transaction(() => {
  const stats = {}
  // 1. 关系边整体重写（改挂 + 去重 + 去自环），保留原 id/证据/确认态
  db.prepare('DELETE FROM dl_relation WHERE project_id=?').run(SPACE)
  const insRel = db.prepare(
    `INSERT INTO dl_relation (id,user_id,project_id,source_id,target_id,relation_type,evidence,verified,created_at)
     VALUES (@id,@user_id,@project_id,@source_id,@target_id,@relation_type,@evidence,@verified,@created_at)`,
  )
  for (const r of nextRels) insRel.run(r)
  stats.relations = nextRels.length

  // 2. 答疑 / 笔记 / 掌握度记录改挂
  const updQ = db.prepare('UPDATE dl_question SET concept_id=? WHERE id=?')
  for (const q of qTouched) updQ.run(mapId(q.concept_id), q.id)
  const updN = db.prepare('UPDATE dl_note SET concept_id=? WHERE id=?')
  for (const n of nTouched) updN.run(mapId(n.concept_id), n.id)
  const updL = db.prepare('UPDATE dl_mastery_log SET concept_id=? WHERE id=?')
  for (const l of lTouched) updL.run(mapId(l.concept_id), l.id)
  stats.questions = qTouched.length
  stats.notes = nTouched.length
  stats.logs = lTouched.length

  // 3. 子节点改归属 + 掌握度提升
  const updParent = db.prepare('UPDATE dl_concept SET parent_id=?, updated_at=? WHERE id=?')
  for (const c of childrenToReparent) updParent.run(deleteMap.get(c.parent_id), now, c.id)
  const updMastery = db.prepare('UPDATE dl_concept SET mastery=?, updated_at=? WHERE id=?')
  for (const p of promotions) {
    const g = groups.find((x) => x.members[0].name === p.keeper)
    updMastery.run(p.to, now, g.members[0].id)
  }
  stats.children = childrenToReparent.length
  stats.promotions = promotions.length

  // 4. 删讲义卡 + 删节点
  const delCard = db.prepare('DELETE FROM dl_card WHERE concept_id=?')
  for (const c of cardsToDelete) delCard.run(c.concept_id)
  const delNode = db.prepare('DELETE FROM dl_concept WHERE id=?')
  for (const id of deleteMap.keys()) delNode.run(id)
  stats.cards = cardsToDelete.length
  stats.nodes = deleteMap.size
  return stats
})
const stats = run()
console.log(`[dedupe] 完成：删节点 ${stats.nodes}、删讲义 ${stats.cards}、关系边重写为 ${stats.relations}、改挂答疑 ${stats.questions}/笔记 ${stats.notes}/掌握度 ${stats.logs}、改归属子节点 ${stats.children}、掌握度提升 ${stats.promotions}`)

// ---------- 自检 ----------
const leftNodes = db.prepare('SELECT COUNT(*) n FROM dl_concept WHERE project_id=?').get(SPACE).n
const leftQ = db.prepare('SELECT COUNT(*) n FROM dl_question WHERE project_id=?').get(SPACE).n
const leftN = db.prepare('SELECT COUNT(*) n FROM dl_note WHERE project_id=?').get(SPACE).n
const leftL = db.prepare('SELECT COUNT(*) n FROM dl_mastery_log WHERE project_id=?').get(SPACE).n
const gone = [...deleteMap.keys()].filter((id) => db.prepare('SELECT 1 FROM dl_concept WHERE id=?').get(id))
console.log(`[dedupe] 自检：节点 ${nodes.length}→${leftNodes}；答疑 ${leftQ}、笔记 ${leftN}、掌握度 ${leftL}（应与处理前一致：${questions.length}/${notes.length}/${logs.length}）；残留被删节点 ${gone.length}`)
if (gone.length || leftQ !== questions.length || leftN !== notes.length || leftL !== logs.length) {
  console.error('[dedupe] 自检不通过——请用备份回滚并排查')
  db.close()
  process.exit(1)
}
db.close()
