/**
 * 领域共学讲义「区集契约」横向取证(只读)
 * 输出: 每个空间/概念/版本一行的 区 key 序列 + 时间 + 是否可折叠答案，用于量化"同主题不同模板"
 * 运行: ELECTRON_RUN_AS_NODE=1 electron progress/_dl_lesson_shape_summary.cjs [dbPath]
 */
const Database = require('better-sqlite3')

const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const db = new Database(DB_PATH, { readonly: true })
const jsonOf = (v) => {
  if (v == null) return null
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

// 与 src/shared/utils/lesson-selfcheck.ts 同口径复刻
const ANSWER_MARKER_LINE =
  /^\s{0,3}(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:参考答案与解析|答案与解析|参考答案|标准答案|正确答案|答案|解答)\s*(?:\*\*|__)?\s*[:：]?\s*$/
function canFold(md) {
  return String(md || '')
    .split(/\r?\n/)
    .some((l) => ANSWER_MARKER_LINE.test(l))
}

const projects = db.prepare('SELECT * FROM dl_project ORDER BY created_at').all()
for (const p of projects) {
  const concepts = db.prepare('SELECT * FROM dl_concept WHERE project_id=?').all(p.id)
  const cards = db.prepare('SELECT * FROM dl_card WHERE project_id=? ORDER BY created_at, version').all(p.id)
  if (!cards.length) continue
  console.log(`\n===== 空间「${p.name}」 卡 ${cards.length} 张 =====`)
  console.log('概念 | 版本 | 状态 | created | updated | 区 key 序列 | 末区可折叠答案')
  for (const card of cards) {
    const c = concepts.find((x) => x.id === card.concept_id)
    const secs = jsonOf(card.sections) || []
    const keys = secs.map((s) => s.key).join('>')
    const foldKinds = secs
      .map((s) =>
        canFold(s.md)
          ? `${s.key}:文本标记`
          : /^(answers|answer|solutions|solution)$/.test(String(s.key))
            ? `${s.key}:独立区`
            : null
      )
      .filter(Boolean)
    const foldable = foldKinds.length ? `是(${foldKinds.join(',')})` : '否'
    console.log(
      `${c ? c.name : card.concept_id} | v${card.version} | ${card.status} | ${card.created_at} | ${card.updated_at} | ${keys} | ${foldable}`
    )
  }
  // 各卡区的 key 集合是否一致
  const keySets = new Set(
    cards.map((card) => (jsonOf(card.sections) || []).map((s) => s.key).join('>'))
  )
  console.log(`→ 本空间出现的不同区序数: ${keySets.size}（${cards.length} 张卡）`)
  for (const k of keySets) console.log(`   ${k}`)
}
db.close()
