/**
 * 只读：贝叶斯空间「重复知识点」判定清单 + 每个重复组的成员证据
 * 组由人工通读 499 个知识点后定义（同一知识点、仅名称/措辞不同）。
 * 用法：ELECTRON_RUN_AS_NODE=1 electron progress/_dl_bayes_dedupe_plan.cjs [dbPath]
 */
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const SPACE = '62810aa7-fe29-495f-b2a4-11e6a243b42c'

/** 明确重复组：同一知识点，仅名称/措辞不同。数组首项 = 建议保留 */
const CLEAR_GROUPS = [
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

/** 名称重复、须按 id 指定的组（同名不同大小写） */
const ID_GROUPS = [
  {
    reason: '同名「先验概率」两个节点',
    keep: '1e2c5b4e-0000-0000-0000-000000000000', // 占位，运行时按 id 表解析
    ids: [],
  },
]

/** 疑似重复组（相关/包含关系，先列出不动，等用户定） */
const SUSPECT_GROUPS = [
  ['后验一致性与收敛速率', '后验一致性', '弱后验一致性与强后验一致性'],
  ['MCMC 收敛诊断', 'MCMC 收敛诊断（R-hat 与 ESS）'],
  ['马尔可夫链与平稳分布', '马尔可夫链（Markov Chain）', '平稳分布'],
  ['迹图与秩图', '迹图', '秩图'],
  ['自相关与积分自相关时间', '自相关'],
  ['方差缩减与重要抽样', '重要抽样估计量', '重要性权重（似然比）'],
  ['可信区间（Credible interval）', '最高后验密度区间（HDI / HPD）', '等尾可信区间（Equal-tailed interval, ETI）'],
  ['积分与密度（Integral & Density）', '积分基础', '积分与期望记号（∫ 与 E_p[·]）', '积分与求和记号（∫ 与 Σ）'],
  ['标准差', '方差与标准差'],
  ['均值标准误（SEM, standard error of the mean）', '标准误（Standard Error）'],
  ['概率与随机变量', '概率分布', '随机变量与分布'],
  ['样本空间', '样本空间与事件', '概率空间与事件'],
  ['有向无环图与 d-分离', '有向无环图（DAG）', 'd-分离（d-separation）'],
  ['Metropolis 接受率与细致平衡', '细致平衡条件'],
  ['包络常数 M 与接受率', '拒绝采样'],
  ['逆变换采样', '离散分布的逆变换采样（累积和查表法）', '混合分布的逆变换采样', '数值反演（无解析反函数时的逆变换采样）'],
  ['参数化与重参数化（parameterization / reparameterization）', '重参数化技巧（reparameterization trick）'],
  ['后验高斯逼近（Laplace 型正态近似）', '拉普拉斯近似（Laplace approximation）'],
  ['先验质量条件（KL 邻域与小球概率）', '小球概率与小球条件'],
  ['指数分离检验条件（testing condition）', '错误概率的指数衰减（exponentially small error probability）'],
  ['先验敏感性分析', '先验选择与稳健性'],
  ['贝叶斯非参数', '非参数贝叶斯建模（应对误设的扩族路线）'],
  ['截断折棍狄利克雷过程混合模型', '狄利克雷过程混合模型（DPMM）'],
  ['潜在结果与反事实', '反事实'],
  ['不可约性与非周期性', '遍历性'],
  ['分位数与 5%/95% 尾部（Quantile）', '分位数函数（Quantile function）'],
  ['梯度（gradient ∇）', '梯度与梯度下降'],
]

const db = new Database(DB_PATH, { readonly: true })
const nodes = db
  .prepare("SELECT * FROM dl_concept WHERE project_id=? AND node_type<>'group'")
  .all(SPACE)
const byName = new Map()
for (const n of nodes) {
  if (!byName.has(n.name)) byName.set(n.name, [])
  byName.get(n.name).push(n)
}
const cards = db.prepare('SELECT * FROM dl_card WHERE project_id=?').all(SPACE)
const rels = db.prepare('SELECT * FROM dl_relation WHERE project_id=?').all(SPACE)
const questions = db.prepare('SELECT * FROM dl_question WHERE project_id=?').all(SPACE)
const notes = db.prepare('SELECT * FROM dl_note WHERE project_id=?').all(SPACE)
const logs = db.prepare('SELECT * FROM dl_mastery_log WHERE project_id=?').all(SPACE)
const allNodes = db.prepare('SELECT id,name,node_type FROM dl_concept WHERE project_id=?').all(SPACE)
const nodeName = new Map(allNodes.map((n) => [n.id, n.name]))
const nodeType = new Map(allNodes.map((n) => [n.id, n.node_type]))

const cardsOf = new Map()
for (const k of cards) {
  if (!cardsOf.has(k.concept_id)) cardsOf.set(k.concept_id, [])
  cardsOf.get(k.concept_id).push(k)
}
function cardText(k) {
  if (!k) return ''
  let s = ''
  try {
    const sec = typeof k.sections === 'string' ? JSON.parse(k.sections) : k.sections
    for (const x of sec || []) s += `${x.title || x.key || ''}\n${x.md || ''}\n`
  } catch {
    s += String(k.sections || '')
  }
  return s + (k.content_md || '')
}
const relCnt = new Map()
for (const r of rels) {
  relCnt.set(r.source_id, (relCnt.get(r.source_id) || 0) + 1)
  relCnt.set(r.target_id, (relCnt.get(r.target_id) || 0) + 1)
}
const qCnt = new Map()
for (const q of questions) if (q.concept_id) qCnt.set(q.concept_id, (qCnt.get(q.concept_id) || 0) + 1)
const nCnt = new Map()
for (const n of notes) if (n.concept_id) nCnt.set(n.concept_id, (nCnt.get(n.concept_id) || 0) + 1)
const lCnt = new Map()
for (const l of logs) lCnt.set(l.concept_id, (lCnt.get(l.concept_id) || 0) + 1)

function info(n) {
  const ks = (cardsOf.get(n.id) || []).slice().sort((a, b) => b.version - a.version)
  const best = ks[0]
  const cur = n.card_id ? ks.find((k) => k.id === n.card_id) || best : best
  return {
    id: n.id,
    name: n.name,
    en: n.en || '',
    parent: n.parent_id ? `${nodeName.get(n.parent_id) || n.parent_id}${nodeType.get(n.parent_id) !== 'group' ? '(非目录)' : ''}` : '根层',
    createdAt: n.created_at,
    cards: ks.map((k) => `v${k.version}/${k.status}`).join(',') || '无',
    cardLen: cardText(cur).length,
    rel: relCnt.get(n.id) || 0,
    q: qCnt.get(n.id) || 0,
    note: nCnt.get(n.id) || 0,
    log: lCnt.get(n.id) || 0,
    def: (n.definition_short || '').replace(/\s+/g, ' '),
  }
}

const problems = []
const resolved = []
for (const g of CLEAR_GROUPS) {
  const members = []
  for (const name of g) {
    const hits = byName.get(name) || []
    if (hits.length !== 1) problems.push(`名称「${name}」命中 ${hits.length} 个节点（需按 id 指定）`)
    for (const h of hits) members.push(info(h))
  }
  resolved.push({ names: g, members })
}

console.log(`明确重复组 ${resolved.length} 组；疑似重复组 ${SUSPECT_GROUPS.length} 组`)
if (problems.length) {
  console.log('\n!! 名称解析问题：')
  for (const p of problems) console.log('  -', p)
}

let delTotal = 0
console.log('\n================ 明确重复组（首项=建议保留）')
for (const [i, g] of resolved.entries()) {
  console.log(`\n[${i + 1}] ${g.names.join('  ⟷  ')}`)
  for (const [j, m] of g.members.entries()) {
    console.log(
      `${j === 0 ? '  ★保留' : '   删除'} ${m.name} | 目录=${m.parent} | 卡=${m.cards}(${m.cardLen}B) 边=${m.rel} 答疑=${m.q} 笔记=${m.note} 掌握度=${m.log} | ${m.createdAt}`,
    )
    console.log(`         id=${m.id}`)
    console.log(`         def=${m.def.slice(0, 90)}`)
  }
  delTotal += g.members.length - 1
}

console.log('\n================ 疑似重复组（本次不动，等用户决定）')
for (const [i, g] of SUSPECT_GROUPS.entries()) {
  const present = []
  for (const name of g) {
    const hits = byName.get(name) || []
    for (const h of hits) present.push(info(h))
  }
  console.log(`\n[S${i + 1}] ${g.join('  ⟷  ')}`)
  for (const m of present) {
    console.log(`     ${m.name} | 目录=${m.parent} | 卡=${m.cards}(${m.cardLen}B) 边=${m.rel} | id=${m.id}`)
  }
}

console.log(`\n明确重复组将删除 ${delTotal} 个节点（保留 ${resolved.length} 个）`)

const out = path.join(__dirname, '_dl_bayes_dedupe_plan.json')
fs.writeFileSync(out, JSON.stringify({ resolved, suspect: SUSPECT_GROUPS }, null, 2))
console.log(`明细：${out}`)
db.close()
