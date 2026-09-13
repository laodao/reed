/* 取证:领域空间数据质量问题——同名概念多行/重复关系/孤儿引用(只读) */
const Database = require('better-sqlite3')
const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })

const projects = db.prepare('SELECT id,name FROM dl_project').all()
for (const p of projects) {
  const concepts = db.prepare('SELECT id,name,node_type,parent_id,research_state,mastery,card_id FROM dl_concept WHERE project_id=?').all(p.id)
  const relations = db.prepare('SELECT id,source_id,target_id,relation_type,verified FROM dl_relation WHERE project_id=?').all(p.id)
  const cards = db.prepare('SELECT id,concept_id,status,version FROM dl_card WHERE project_id=?').all(p.id)

  // 同名概念多行(同空间)
  const byName = {}
  for (const c of concepts) {
    if (c.node_type === 'group') continue
    const k = c.name
    ;(byName[k] = byName[k] || []).push(c)
  }
  const dupNames = Object.entries(byName).filter(([, arr]) => arr.length > 1)

  // 重复三元组(同 source/target/type)
  const seen = {}
  let dupRels = 0
  for (const r of relations) {
    const k = r.source_id + '|' + r.target_id + '|' + r.relation_type
    seen[k] = (seen[k] || 0) + 1
    if (seen[k] === 2) dupRels++
  }

  // 孤儿:relation 指向不存在的概念;card 指向不存在概念;concept.card_id 指向不存在卡
  const cids = new Set(concepts.map((c) => c.id))
  const cardIds = new Set(cards.map((c) => c.id))
  const orphanRels = relations.filter((r) => !cids.has(r.source_id) || !cids.has(r.target_id)).length
  const orphanCards = cards.filter((c) => !cids.has(c.concept_id)).length
  const badCardRefs = concepts.filter((c) => c.card_id && !cardIds.has(c.card_id)).length

  // 无卡概念(研究态已 extracted 但无卡?不该出现;unresearched 正常)
  const noCardConcepts = concepts.filter((c) => c.node_type !== 'group' && !c.card_id).length

  console.log('== ' + p.name + ' (' + p.id + ')')
  console.log('   concepts=' + concepts.length + ' relations=' + relations.length + ' cards=' + cards.length)
  console.log('   dupNames=' + dupNames.length + ' dupRelTriples=' + dupRels + ' orphanRels=' + orphanRels + ' orphanCards=' + orphanCards + ' badCardRefs=' + badCardRefs + ' noCardConcepts=' + noCardConcepts)
  for (const [name, arr] of dupNames) {
    console.log('   DUP[' + name + ']: ' + arr.map((c) => `id=${c.id.slice(0, 8)} parent=${c.parent_id ? c.parent_id.slice(0, 8) : 'null'} research=${c.research_state} mastery=${c.mastery} card=${c.card_id ? c.card_id.slice(0, 8) : '-'}`).join(' | '))
  }
}
db.close()
