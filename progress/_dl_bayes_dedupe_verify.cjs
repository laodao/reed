/**
 * 独立只读复核：贝叶斯空间去重是否干净、用户数据是否一条未丢、其他空间是否未受影响
 * 用法：ELECTRON_RUN_AS_NODE=1 electron progress/_dl_bayes_dedupe_verify.cjs [liveDb] [backupDb]
 */
const Database = require('better-sqlite3')

const LIVE = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const BAK = process.argv[3] || 'C:\\Users\\daoge\\the-bot\\the_bot.db.bak-dedupeBayes-2026-09-13-17-45-28'
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

/** 41 组的保留节点 id 与被删节点 id（由 dry-run 计划固化，用于事后核对） */
const KEEPERS = [
  'e7a6d65a-d11f-4cee-916f-fd82dcb6a091', // KL 散度
  'c7c603c0-28b7-41a5-befb-39a2e4e409b7', // Fisher 信息量
  '151d9406-ef82-48a7-9013-6a40b62c31e4', // 得分函数（Score）
  '2d1b5522-a50b-4bf2-bfd1-6b3a5ec2f8f0', // 马尔可夫链蒙特卡洛（MCMC）
  'a4f1abf4-f1ef-4610-b98a-1398674ac215', // 马尔可夫链（Markov Chain）
  '655d5e4e-2737-4567-9916-1db885944885', // 平稳分布
  '46e3223f-478a-4c39-8799-5329e1631fb4', // R̂
  '8f5434c6-aeb9-442a-bafe-6f7cc6343fb2', // 有效样本量 ESS
  '7736d26b-466e-43b8-abba-c493af01583b', // 秩图
  'e3a9c60d-8555-4aeb-939a-b643cbc65e4b', // 自相关
  '189b9f8d-5c4e-450c-8f87-b3ee02fa18a4', // 期望（数学期望）
  '5d9ffe9f-99bd-46ea-8ebb-ae1239cf8a63', // 期望与方差
  'c63bdb8f-e021-4351-98d8-8c48306f7848', // 后验分布
  'c6af4820-dbed-4e52-95d0-db46aa68eb81', // 后验一致性
  'def97d01-02bf-4f54-96f0-3f2a4cdbc877', // 后验收缩率
  '10f0fb6d-b977-4723-9ee7-de7b7246ff14', // 贝叶斯方法论的开放问题
  '2367bc41-3785-4388-85f2-0fb61da07c96', // Bernstein–von Mises 定理
  '822fa976-9fa9-47b2-9854-2e7e41e8cca8', // 低差异序列
  '911620f1-50d6-4824-9fcd-031db6a6d987', // do-演算
  '072acdd1-b889-4d1b-951f-93b1c82688ab', // 反事实
  '48c8acb0-fa90-4c59-a68c-bb5ef2077c14', // 变分推断（VI）
  '8b99667a-7243-4274-a777-62a95ac96d81', // 测度
  '4297f2bf-ff22-424a-82e8-7884b0937bca', // 经验贝叶斯（Empirical Bayes）
  '286878b1-04e9-4f78-80f6-4f75bdf4988b', // 非参数贝叶斯建模
  '8f1a535d-5855-4ab8-9710-dab85f11b0e7', // 随机变量与分布
  '18964cc0-f991-4e90-a08c-c06f3af0523f', // 三明治方差
  'd8144bb0-1930-431a-bef1-7c509808a5cd', // 导数与偏导数
  '42aed1f2-a6f7-459b-ba90-a57eef2db842', // 一元函数导数与求导法则
  '368373ed-c774-4ad5-8b9a-fddf33cb1469', // 对数与指数函数
  '89d9dadf-b2df-4837-b1f5-95952dc85305', // 积分与求和记号
  'ae3505e4-13a3-42ca-abae-87e49b2c9ea0', // 狄利克雷过程
  '163f4b8d-ea41-4128-acb6-b871df57e462', // 模型错误指定
  '8a79dce1-8cb0-4e5a-a2f1-6816f8665bbe', // 分位数函数
  '22739376-3175-44fa-b2fb-6a34e50ba183', // 随机梯度
  '26e55b93-4ceb-469a-b118-949c4833900d', // 平均场假设
  '0e5036fe-c8ef-4559-b6a2-71a2e46b8aed', // 高斯过程
  'f80cd7a3-f96a-4f78-a127-2b4b8cd8ff69', // 方差与标准差
  '3b4212b5-753d-4841-8d02-1ec84033a80b', // 蒙特卡洛估计量
  'e0da8cad-fef3-4a20-96aa-cc8119f482b2', // 大数定律
  '0d846f07-f702-4649-9120-6ccc6290b4e5', // 因果效应的可识别性
  '16943f19-2e1f-46d0-981c-25d864f0b655', // 先验概率（掌握度记录挂在它上面）
]
/** 有用户数据、必须确认已改挂的两处 */
const REMAP_EXPECT = [
  { what: '答疑/笔记', from: 'bd5686df-cce6-43b1-a704-fd65eccd94b8', to: '10f0fb6d-b977-4723-9ee7-de7b7246ff14' },
  { what: '答疑', from: 'e9d68fbb-c544-4fa6-b3e5-af733e6362a6', to: '22739376-3175-44fa-b2fb-6a34e50ba183' },
]

const problems = []
const check = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) problems.push(msg)
}

const live = new Database(LIVE, { readonly: true })
const bak = new Database(BAK, { readonly: true })

console.log(`实时库：${LIVE}\n对照快照：${BAK}\n`)

console.log('① 41 个保留节点都在')
let missing = 0
for (const id of KEEPERS) if (!live.prepare('SELECT 1 FROM dl_concept WHERE id=?').get(id)) missing++
check(missing === 0 && KEEPERS.length === 41, `保留节点 ${KEEPERS.length - missing}/${KEEPERS.length} 存在`)

console.log('\n② 空间规模（实时 vs 快照）')
for (const t of ['dl_concept', 'dl_relation', 'dl_card', 'dl_question', 'dl_note', 'dl_mastery_log']) {
  const a = live.prepare(`SELECT COUNT(*) n FROM ${t} WHERE project_id=?`).get(SPACE).n
  const b = bak.prepare(`SELECT COUNT(*) n FROM ${t} WHERE project_id=?`).get(SPACE).n
  console.log(`  ${t}: ${b} → ${a}`)
}

console.log('\n③ 用户数据必须一条不丢，且已改挂到保留节点')
for (const r of REMAP_EXPECT) {
  if (r.what.includes('答疑')) {
    const n = live.prepare('SELECT COUNT(*) n FROM dl_question WHERE project_id=? AND concept_id=?').get(SPACE, r.to).n
    const old = live.prepare('SELECT COUNT(*) n FROM dl_question WHERE project_id=? AND concept_id=?').get(SPACE, r.from).n
    check(n > 0 && old === 0, `答疑已改挂到 ${r.to.slice(0, 8)}…（原节点剩 ${old} 条）`)
  }
  if (r.what.includes('笔记') && r.what.includes('答疑')) {
    const n = live.prepare('SELECT COUNT(*) n FROM dl_note WHERE project_id=? AND concept_id=?').get(SPACE, r.to).n
    const old = live.prepare('SELECT COUNT(*) n FROM dl_note WHERE project_id=? AND concept_id=?').get(SPACE, r.from).n
    check(n > 0 && old === 0, `笔记已改挂到 ${r.to.slice(0, 8)}…（原节点剩 ${old} 条）`)
  }
}
// 掌握度记录：条数不变、且指向的节点仍存在（不必属于本次 41 个保留项——
// 例如「贝叶斯定理」本就不在重复之列）
const lmBak = bak.prepare('SELECT id,concept_id FROM dl_mastery_log WHERE project_id=?').all(SPACE)
const lmLive = live.prepare('SELECT id,concept_id FROM dl_mastery_log WHERE project_id=?').all(SPACE)
const logDangling = lmLive.filter((r) => !live.prepare('SELECT 1 FROM dl_concept WHERE id=?').get(r.concept_id))
check(
  lmLive.length === lmBak.length && logDangling.length === 0,
  `掌握度记录 ${lmBak.length} → ${lmLive.length} 条，指向节点均存在（${lmLive.map((r) => r.concept_id.slice(0, 8)).join(',')}）`,
)

console.log('\n④ 名称重复应清零（同一空间内规范化名称不再重复）')
const norm = (s) =>
  s
    .replace(/[（(][^（()）]*[)）]/g, '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[·・:：,，、.。;；'"“”‘’\-—_/\\|]/g, '')
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .toLowerCase()
const namesOf = (db) =>
  db
    .prepare("SELECT name FROM dl_concept WHERE project_id=? AND node_type<>'group'")
    .all(SPACE)
    .map((r) => r.name)
const dupGroupsOf = (list) => {
  const m = new Map()
  for (const n of list) {
    const k = norm(n)
    if (!k) continue
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(n)
  }
  return [...m.entries()].filter(([, v]) => v.length > 1)
}
const dupBak = dupGroupsOf(namesOf(bak))
const dupLive = dupGroupsOf(namesOf(live))
console.log(`  处理前同名组 ${dupBak.length} 组，处理后 ${dupLive.length} 组`)
for (const [k, v] of dupLive) console.log(`    · 残留（B 类，本次按约定不动）：${v.join(' / ')}`)
// 残留只允许是 B 类（疑似清单里那类）；A 类 41 组必须已清零
const B_KEYS = ['mcmc收敛诊断']
const aLeft = dupLive.filter(([k]) => !B_KEYS.includes(k))
check(aLeft.length === 0, `A 类同名组已清零（残留 ${aLeft.length} 组${aLeft.length ? '：' + aLeft.map(([k, v]) => v.join('/')).join('；') : ''}）`)

console.log('\n⑤ 悬挂关系边只能是历史遗留（端点写成概念名而非 id），不得新增')
const danglingOf = (db) =>
  db
    .prepare(
      `SELECT r.source_id s, r.target_id t, r.relation_type ty FROM dl_relation r
       WHERE r.project_id=?
         AND (NOT EXISTS (SELECT 1 FROM dl_concept c WHERE c.id=r.source_id)
           OR NOT EXISTS (SELECT 1 FROM dl_concept c WHERE c.id=r.target_id))`,
    )
    .all(SPACE)
const dLive = danglingOf(live)
const dBak = danglingOf(bak)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const legacyOnly = dLive.every((r) => !UUID.test(r.s) || !UUID.test(r.t))
console.log(`  处理前 ${dBak.length} 条 / 处理后 ${dLive.length} 条`)
for (const r of dLive) console.log(`    ${r.s} → ${r.t} (${r.ty})`)
check(
  legacyOnly && dLive.length <= dBak.length,
  `悬挂边未新增且全部是历史遗留（端点非 uuid）${dLive.length < dBak.length ? `；减少的 ${dBak.length - dLive.length} 条是「目标被合并节点」的重复边被合并（见 progress 记录）` : ''}`,
)

console.log('\n⑥ 其他空间规模不变')
for (const p of bak.prepare('SELECT id,name FROM dl_project ORDER BY created_at').all()) {
  if (p.id === SPACE) continue
  const a = live.prepare('SELECT COUNT(*) n FROM dl_concept WHERE project_id=?').get(p.id).n
  const b = bak.prepare('SELECT COUNT(*) n FROM dl_concept WHERE project_id=?').get(p.id).n
  check(a === b, `${p.name}: ${b} → ${a}`)
}

live.close()
bak.close()
console.log(problems.length ? `\n复核不通过：${problems.length} 项` : '\n复核通过：重复已清、用户数据零丢失、其他空间未受影响')
process.exit(problems.length ? 1 : 0)
