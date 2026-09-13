/**
 * 导出领域共学空间真机数据(项目/概念/讲义卡/关系/已答问答)为 markdown,
 * 供「初学者视角」内容评估与复盘取证。只读不改库。
 * 运行:ELECTRON_RUN_AS_NODE=1 electron scripts/_dl_export_lessons.cjs [dbPath] [outDir]
 */
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

const DB_PATH = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\the_bot.db'
const OUT_DIR = process.argv[3] || path.join(__dirname, '..', 'progress', '_dl_export')

function main() {
  const db = new Database(DB_PATH, { readonly: true })
  const hasTable = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)
  const colsOf = (t) => new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name))
  const pick = (row, cols, ...cands) => {
    for (const c of cands) if (cols.has(c)) return row[c]
    return undefined
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  if (!hasTable('dl_project')) {
    console.log('[dl-export] 该库无 dl_project 表:', DB_PATH)
    db.close()
    return
  }
  const projectCols = colsOf('dl_project')
  const conceptCols = colsOf('dl_concept')
  const cardCols = colsOf('dl_card')
  const qCols = colsOf('dl_question')
  const relCols = colsOf('dl_relation')

  const projects = db.prepare('SELECT * FROM dl_project ORDER BY created_at').all()
  console.log('[dl-export] projects:', projects.length)

  const jsonOf = (v) => {
    if (v == null) return null
    try {
      return JSON.parse(v)
    } catch {
      return null
    }
  }
  const line = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim())
  const san = (s) => String(s ?? '未命名').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60)

  const indexLines = [`# 领域共学空间内容导出(只读取证)`, '', `库: ${DB_PATH}`, `时间: ${new Date().toISOString()}`, '']

  for (const p of projects) {
    const pid = p.id
    const dir = path.join(OUT_DIR, san(pick(p, projectCols, 'name')))
    fs.mkdirSync(dir, { recursive: true })
    const concepts = db.prepare('SELECT * FROM dl_concept WHERE project_id=? ORDER BY created_at').all(pid)
    const relations = db.prepare('SELECT * FROM dl_relation WHERE project_id=? ORDER BY created_at').all(pid)
    const cards = db.prepare('SELECT * FROM dl_card WHERE project_id=? ORDER BY created_at').all(pid)
    const questions = db.prepare("SELECT * FROM dl_question WHERE project_id=? AND status='answered' ORDER BY answered_at").all(pid)

    const L = []
    L.push(`# 学习空间: ${pick(p, projectCols, 'name')} (id=${pid})`, '')
    L.push(`- 目标: ${pick(p, projectCols, 'goal') || '—'}`)
    L.push(`- 绑定知识库: ${pick(p, projectCols, 'kb_id') || '无'}`)
    L.push(`- 状态: ${pick(p, projectCols, 'status') || '—'}`)
    L.push(`- 概念: ${concepts.length} | 关系: ${relations.length} | 讲义卡: ${cards.length} | 已答问答: ${questions.length}`, '')

    L.push('## 概念清单', '', '| 名称 | 类型 | 掌握度 | 研究态 | 一句话定义 |', '| --- | --- | --- | --- | --- |')
    for (const c of concepts) {
      L.push(`| ${c.name} | ${pick(c, conceptCols, 'node_type') || ''} | ${pick(c, conceptCols, 'mastery') || ''} | ${pick(c, conceptCols, 'research_state') || ''} | ${line(pick(c, conceptCols, 'definition_short'))} |`)
    }
    L.push('')

    L.push('## 关系(学习顺序)', '')
    if (!relations.length) L.push('(无)')
    for (const r of relations) {
      const src = concepts.find((c) => c.id === pick(r, relCols, 'source_id'))
      const tgt = concepts.find((c) => c.id === pick(r, relCols, 'target_id'))
      L.push(`- ${src ? src.name : pick(r, relCols, 'source_id')} → ${tgt ? tgt.name : pick(r, relCols, 'target_id')} (${pick(r, relCols, 'relation_type') || 'prerequisite'}, verified=${pick(r, relCols, 'verified')})`)
    }
    L.push('')

    for (const card of cards) {
      const concept = concepts.find((c) => c.id === pick(card, cardCols, 'concept_id'))
      const cname = concept ? concept.name : pick(card, cardCols, 'concept_id')
      const md = []
      md.push(`# 讲义: ${cname}`, '')
      md.push(`- 概念 id: ${pick(card, cardCols, 'concept_id')}`)
      md.push(`- 本质类型: ${pick(card, cardCols, 'essence_type') || ''}`)
      md.push(`- 状态: ${pick(card, cardCols, 'status') || ''} | version: ${pick(card, cardCols, 'version') || ''}`)
      const up = pick(card, cardCols, 'updated_at')
      if (up) md.push(`- 更新时间: ${up}`)
      const ver = jsonOf(pick(card, cardCols, 'verification'))
      if (ver) md.push(`- 自动核验: status=${ver.status || '?'} issues=${Array.isArray(ver.issues) ? ver.issues.length : '?'}`)
      md.push('')
      const sections = jsonOf(pick(card, cardCols, 'sections'))
      if (Array.isArray(sections)) {
        for (const s of sections) {
          md.push(`## [区:${s.key || ''}] ${s.title || s.key || ''}`, '')
          md.push(String(s.md || ''), '')
        }
      }
      const ev = jsonOf(pick(card, cardCols, 'evidence_sources'))
      if (Array.isArray(ev) && ev.length) {
        md.push('## 证据来源', '')
        for (const e of ev) {
          md.push(`- [${e.kind || ''}] ${e.title || ''}${e.url ? ` (${e.url})` : ''}${e.kbDocId || e.kb_doc_id ? ` kbDocId=${e.kbDocId || e.kb_doc_id}` : ''}`)
          if (e.quote) md.push(`  引文: ${line(e.quote)}`)
        }
        md.push('')
      }
      const works = jsonOf(pick(card, cardCols, 'works'))
      if (Array.isArray(works) && works.length) {
        md.push('## 相关著作', '')
        for (const w of works) md.push(`- ${w.title || ''}${w.authors ? ` — ${w.authors}` : ''}${w.year ? ` (${w.year})` : ''}`)
        md.push('')
      }
      const body = md.join('\n')
      fs.writeFileSync(path.join(dir, `讲义-${san(cname)}-v${pick(card, cardCols, 'version') || '?'}.md`), body, 'utf8')
      L.push(body, '')
    }

    L.push('## 已答问答(答疑历史)', '')
    if (!questions.length) L.push('(无)')
    for (const q of questions) {
      const qc = concepts.find((c) => c.id === pick(q, qCols, 'concept_id'))
      L.push(`### Q: ${q.question} ${qc ? `(概念:${qc.name})` : ''} [来源:${pick(q, qCols, 'answer_source') || ''}]`, '')
      L.push(pick(q, qCols, 'answer_md') || '(无答案文本)', '')
      L.push('')
    }

    const pname = san(pick(p, projectCols, 'name'))
    fs.writeFileSync(path.join(dir, '空间总览.md'), L.join('\n'), 'utf8')
    indexLines.push(`- [${pick(p, projectCols, 'name')} (${concepts.length} 概念/${cards.length} 卡/${questions.length} 问答)](./${encodeURIComponent(pname)}/空间总览.md)`)
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.md'), indexLines.join('\n'), 'utf8')
  console.log('[dl-export] done ->', OUT_DIR)
  db.close()
}

main()
