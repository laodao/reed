/**
 * 一次性数据清理：删除指定知识点下的讲义卡（不删知识点、不删关系边）
 *
 * 背景（2026-09-13 用户指令「删除张量和自动微分与反向传播的知识内容」+ 选定范围「只删讲义卡」）：
 * 深度学习空间这两张讲义的结构各不相同（区集/标题层级/答案形态），历史卡不做回改，
 * 清掉后由研究流程按新的讲义区集契约重新生成。
 *
 * 口径：
 * - 删 dl_card 里这两个概念的全部版本（含已发布的 v2）；
 * - dl_concept.card_id 置空、research_state 回到 unresearched（界面显示「讲义待研究」）；
 * - 知识点本体、前置关系边、答疑历史、掌握度记录、笔记一律不动；
 * - 写库前用 SQLite 在线备份（VACUUM INTO）落一份快照，可回滚。
 *
 * 用法：
 *   dry-run（默认，只打印）：ELECTRON_RUN_AS_NODE=1 electron progress/_dl_purge_lessons.cjs
 *   实际删除：              ELECTRON_RUN_AS_NODE=1 electron progress/_dl_purge_lessons.cjs --apply
 */
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const DB_PATH = 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const SPACE = 'a13eb877-bf6d-4546-bc43-d08fc010367a'
const NAMES = ['张量', '自动微分与反向传播']
const APPLY = process.argv.includes('--apply')

const db = new Database(DB_PATH)
db.pragma('busy_timeout = 8000')

const space = db.prepare('SELECT * FROM dl_project WHERE id=?').get(SPACE)
if (!space) {
  console.error('[purge] 找不到空间', SPACE)
  process.exit(1)
}
console.log(`[purge] 空间: ${space.name} (${space.id}) goal=${space.goal} status=${space.status}`)
const paceField = Object.keys(space).find((k) => /pace/i.test(k))
console.log(`[purge] pace 字段: ${paceField ? `${paceField}=${space[paceField]}` : '(dl_project 无 pace 列，自动推进设置存别处)'}`)

const concepts = db
  .prepare('SELECT id,name,node_type,research_state,mastery,card_id FROM dl_concept WHERE project_id=?')
  .all(SPACE)
  .filter((c) => NAMES.includes(c.name))

if (concepts.length !== NAMES.length) {
  console.error(`[purge] 命中知识点 ${concepts.length}/${NAMES.length}，名字对不上，终止以免误删`)
  process.exit(1)
}

const ids = concepts.map((c) => c.id)
const cards = db
  .prepare(
    `SELECT id,concept_id,version,status,essence_type,length(sections) AS sec_len
     FROM dl_card WHERE concept_id IN (${ids.map(() => '?').join(',')}) ORDER BY concept_id,version`,
  )
  .all(...ids)

console.log('\n[purge] 将删除的讲义卡:')
for (const k of cards) {
  const c = concepts.find((x) => x.id === k.concept_id)
  console.log(`  ${c.name} v${k.version} ${k.status} ${k.essence_type} ${k.sec_len}B  id=${k.id}`)
}
console.log('\n[purge] 将回写知识点状态:')
for (const c of concepts) {
  console.log(`  ${c.name}: card_id ${c.card_id} → NULL，research_state ${c.research_state} → unresearched（mastery=${c.mastery} 不动）`)
}

// 保护：确认关系边与答疑历史不在删除范围内
const relCount = db
  .prepare(`SELECT COUNT(*) AS n FROM dl_relation WHERE project_id=? AND (source_id IN (${ids.map(() => '?').join(',')}) OR target_id IN (${ids.map(() => '?').join(',')}))`)
  .get(SPACE, ...ids, ...ids).n
const qCount = db
  .prepare(`SELECT COUNT(*) AS n FROM dl_question WHERE project_id=? AND concept_id IN (${ids.map(() => '?').join(',')})`)
  .get(SPACE, ...ids).n
console.log(`\n[purge] 保留不动：关系边 ${relCount} 条、答疑 ${qCount} 条、掌握度记录 ${db.prepare(`SELECT COUNT(*) AS n FROM dl_mastery_log WHERE concept_id IN (${ids.map(() => '?').join(',')})`).get(...ids).n} 条、笔记 ${db.prepare(`SELECT COUNT(*) AS n FROM dl_note WHERE concept_id IN (${ids.map(() => '?').join(',')})`).get(...ids).n} 条`)

if (!APPLY) {
  console.log('\n[purge] dry-run 结束：未写库。加 --apply 实际执行。')
  db.close()
  process.exit(0)
}

// 在线备份（一致快照，不受并发写影响）
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
const backupPath = path.join(path.dirname(DB_PATH), `the_bot.db.bak-purgeLessons-${stamp}`)
db.prepare('VACUUM INTO ?').run(backupPath)
console.log(`\n[purge] 已备份: ${backupPath} (${(fs.statSync(backupPath).size / 1024 / 1024).toFixed(1)} MB)`)

const now = new Date().toISOString().replace('T', ' ').slice(0, 23)
const run = db.transaction(() => {
  const delCards = db.prepare(`DELETE FROM dl_card WHERE concept_id IN (${ids.map(() => '?').join(',')})`).run(...ids)
  const updConcept = db
    .prepare(
      `UPDATE dl_concept SET card_id=NULL, research_state='unresearched', updated_at=?
       WHERE project_id=? AND id IN (${ids.map(() => '?').join(',')})`,
    )
    .run(now, SPACE, ...ids)
  return { deletedCards: delCards.changes, updatedConcepts: updConcept.changes }
})
const result = run()
console.log(`[purge] 完成：删除讲义 ${result.deletedCards} 张，回写知识点 ${result.updatedConcepts} 个`)

// 复核
const leftCards = db.prepare(`SELECT COUNT(*) AS n FROM dl_card WHERE concept_id IN (${ids.map(() => '?').join(',')})`).get(...ids).n
const leftSpaceCards = db.prepare('SELECT COUNT(*) AS n FROM dl_card WHERE project_id=?').get(SPACE).n
console.log(`[purge] 复核：目标概念剩余讲义 ${leftCards} 张；本空间剩余讲义合计 ${leftSpaceCards} 张`)
for (const c of db.prepare('SELECT name,card_id,research_state,mastery FROM dl_concept WHERE id IN (' + ids.map(() => '?').join(',') + ')').all(...ids)) {
  console.log(`  ${c.name}: card_id=${c.card_id} research_state=${c.research_state} mastery=${c.mastery}`)
}
db.close()
