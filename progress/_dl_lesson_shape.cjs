/**
 * 领域共学讲义「结构一致性」取证脚本(只读不改库)
 * 目的: 同一主题下不同知识点的讲义 sections 结构 / 标题层级 / 自测习题-答案组织方式是否统一
 * 运行: ELECTRON_RUN_AS_NODE=1 electron progress/_dl_lesson_shape.cjs [dbPath] [projectNameLike]
 */
const Database = require('better-sqlite3')

const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const LIKE = process.argv[3] || '深度学习'

const db = new Database(DB_PATH, { readonly: true })
const jsonOf = (v) => {
  if (v == null) return null
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

const projects = db.prepare('SELECT * FROM dl_project ORDER BY created_at').all()
const target = projects.filter((p) => String(p.name || '').includes(LIKE))
console.log('[shape] 命中空间:', target.map((p) => `${p.name}(${p.id})`).join(', ') || '(无)')

for (const p of target) {
  const concepts = db.prepare('SELECT * FROM dl_concept WHERE project_id=?').all(p.id)
  const cards = db.prepare('SELECT * FROM dl_card WHERE project_id=? ORDER BY created_at').all(p.id)
  console.log(`\n=========== 空间 ${p.name} (concept=${concepts.length} card=${cards.length}) ===========`)

  // 汇总: 每个概念的 cards 结构
  for (const c of concepts) {
    const myCards = cards.filter((x) => x.concept_id === c.id)
    if (!myCards.length) {
      console.log(`\n--- ${c.name} [无讲义] ---`)
      continue
    }
    for (const card of myCards) {
      const sections = jsonOf(card.sections)
      console.log(
        `\n--- ${c.name} (node_type=${c.node_type}) card v${card.version} status=${card.status} sections=${Array.isArray(sections) ? sections.length : 'null'} hasContentField=${'content_md' in card ? 'yes' : 'no'} ---`
      )
      if (card.content_md) {
        const md = String(card.content_md)
        console.log(`  [content_md 长度=${md.length}]`)
        const hs = md
          .split('\n')
          .filter((l) => /^#{1,6}\s/.test(l))
          .map((l) => l.trim())
        console.log('  content_md 标题序列:')
        for (const h of hs) console.log('    ' + h)
      }
      if (Array.isArray(sections)) {
        console.log('  sections 键序 / 标题 / md 长度 / 内嵌标题:')
        sections.forEach((s, i) => {
          const md = String(s.md || '')
          const hs = md
            .split('\n')
            .filter((l) => /^#{1,6}\s/.test(l))
            .map((l) => l.trim())
          console.log(`    [${i}] key=${s.key} title=${JSON.stringify(s.title)} len=${md.length} 内嵌标题=${JSON.stringify(hs)}`)
        })
        // 习题/答案相关键的原文
        for (const s of sections) {
          const key = String(s.key || '')
          const title = String(s.title || '')
          if (/quiz|test|exercise|question|answer|习题|自测|练习|答案/i.test(key + title)) {
            console.log(`\n  >>> 习题/答案类 section key=${key} title=${title} 原文:`)
            console.log(String(s.md || '').slice(0, 3000))
            console.log('  <<< 结束\n')
          }
        }
      }
    }
  }
}

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'dl_%'").all()
console.log('\n[shape] dl_* 表:', tables.map((t) => t.name).join(', '))
db.close()
