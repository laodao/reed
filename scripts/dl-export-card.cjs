/**
 * 领域学习「当前版本讲义」只读导出（存档 / 对照用）
 * @module scripts/dl-export-card
 *
 * 用途（2026-09-15 用户要求「已有内容不能删除、保存历史版本」）：
 * 在不动数据库的前提下，把某个知识点的**当前讲义版本**导出成 markdown 存档，
 * 便于重生成前后对照，或作为长期留档（DB 只读打开）。
 *
 * 用法（Electron 内置 Node，better-sqlite3 走 Electron ABI）：
 *   ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe scripts/dl-export-card.cjs \
 *     [--db <path>] [--name <知识点名子串>] [--out <文件>] [--list]
 *
 * 缺省：--db 取 %USERPROFILE%/the-bot/the_bot.db 或 %APPDATA%/the_bot/the_bot.db 中较新者。
 * 本脚本**只读**（readonly + fileMustExist），不写库、不改任何行。
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

function parseArgs(argv) {
  const out = { list: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--list') out.list = true
    else if (a === '--db') out.db = argv[++i]
    else if (a === '--name') out.name = argv[++i]
    else if (a === '--out') out.out = argv[++i]
  }
  return out
}

/** 候选 DB 路径（取存在且最新的一个） */
function defaultDb() {
  const candidates = [
    path.join(os.homedir(), 'the-bot', 'the_bot.db'),
    path.join(process.env.APPDATA || '', 'the_bot', 'the_bot.db'),
    path.join(process.env.APPDATA || '', 'the-bot', 'the_bot.db'),
    path.join(process.env.APPDATA || '', 'Electron', 'the_bot.db'),
  ].filter((p) => p && fs.existsSync(p))
  if (!candidates.length) return null
  return candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
}

/** 判断一列是否存在（兼容新旧库） */
function hasColumn(db, table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all()
  return rows.some((r) => r.name === column)
}

function parseJson(text, fallback) {
  if (text === null || text === undefined || text === '') return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/** 讲义区集 → markdown（区标题用落库标题，正文原样） */
function cardToMarkdown(card, concept, workspace) {
  const sections = parseJson(card.sections, [])
  const works = parseJson(card.works, []) || []
  const evidence = parseJson(card.evidence_sources, []) || []
  const lines = []
  lines.push(`# ${concept.name}`)
  lines.push('')
  lines.push('> **当前版本留档（只读导出，未修改数据库）**')
  lines.push(`> 学习空间：${workspace?.name ?? '—'} · 本质类型：${card.essence_type} · 版本：v${card.version} · 状态：${card.status}`)
  if (concept.definition_short) lines.push(`> 一句话定义：${concept.definition_short}`)
  if (card.updated_at || card.created_at) lines.push(`> 落库时间：${card.updated_at || card.created_at}`)
  lines.push('')
  lines.push('## 区集概览')
  lines.push('')
  lines.push('| # | key | 标题 | 字数(非空白) | 折叠 |')
  lines.push('|---|---|---|---|---|')
  sections.forEach((s, i) => {
    const chars = String(s.md ?? '').replace(/\s+/g, '').length
    lines.push(`| ${i + 1} | ${s.key} | ${s.title ?? ''} | ${chars} | ${s.folded ? '是' : ''} |`)
  })
  lines.push('')
  for (const s of sections) {
    lines.push(`## ${s.title || s.key}（${s.key}）`)
    lines.push('')
    lines.push(String(s.md ?? '').trim())
    lines.push('')
  }
  if (works.length) {
    lines.push('## 相关著作')
    lines.push('')
    for (const w of works) lines.push(`- ${w.kind ?? ''}｜${w.title ?? ''}｜${w.authors ?? ''}｜${w.year ?? ''}｜${w.url ?? ''}`)
    lines.push('')
  }
  if (evidence.length) {
    lines.push('## 证据来源')
    lines.push('')
    for (const e of evidence) lines.push(`- ${e.kind ?? ''}｜${e.title ?? ''}｜${e.url ?? ''}${e.quote ? `｜摘录：${e.quote}` : ''}`)
    lines.push('')
  }
  return lines.join('\n')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const dbPath = args.db || defaultDb()
  if (!dbPath) {
    console.error('找不到 the_bot.db；用 --db <path> 指定')
    process.exit(2)
  }
  let Database
  try {
    Database = require('better-sqlite3')
  } catch (e) {
    console.error('需要 Electron ABI 的 better-sqlite3，请用 electron.exe 运行本脚本：', String(e && e.message))
    process.exit(2)
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })

  const hasCardPointer = hasColumn(db, 'dl_concept', 'card_id')
  const rows = db
    .prepare(
      `SELECT c.id, c.project_id, c.name, c.definition_short, ${hasCardPointer ? 'c.card_id' : 'NULL AS card_id'}, p.name AS space_name
       FROM dl_concept c LEFT JOIN dl_project p ON p.id = c.project_id
       WHERE c.node_type <> 'group' ${args.name ? 'AND c.name LIKE ?' : ''}
       ORDER BY c.name`,
    )
    .all(...(args.name ? [`%${args.name}%`] : []))

  if (args.list) {
    console.log(`DB: ${dbPath}`)
    console.log(`知识点 ${rows.length} 个：`)
    for (const r of rows) console.log(`  · [${r.space_name ?? '—'}] ${r.name}`)
    db.close()
    return
  }

  const hit = rows.filter((r) => (args.name ? r.name.includes(args.name) : true))
  if (!hit.length) {
    console.error(`未找到匹配「${args.name ?? ''}」的知识点；可用 --list 查看`)
    db.close()
    process.exit(3)
  }

  const target = hit.find((r) => r.card_id) ?? hit[0]
  const cardStmt = db.prepare('SELECT * FROM dl_card WHERE concept_id = ? ORDER BY version DESC LIMIT 1')
  const card = cardStmt.get(target.id)
  if (!card) {
    console.error(`知识点「${target.name}」当前没有讲义卡`)
    db.close()
    process.exit(4)
  }

  const allVersions = db.prepare('SELECT version, status, created_at FROM dl_card WHERE concept_id = ? ORDER BY version').all(target.id)
  const md = cardToMarkdown(card, target, { name: target.space_name })
  const versionsLine = `\n> 该知识点历史版本：${allVersions.map((v) => `v${v.version}(${v.status})`).join(' → ')}\n`
  const out = args.out || path.join(process.cwd(), `dl-card-${card.id.slice(0, 8)}-v${card.version}.md`)
  fs.writeFileSync(out, md + versionsLine, 'utf8')
  console.log(`DB: ${dbPath}`)
  console.log(`知识点：${target.name}（空间：${target.space_name ?? '—'}）`)
  console.log(`当前版本：v${card.version}（${card.status}）；历史版本：${allVersions.map((v) => `v${v.version}`).join(', ')}`)
  console.log(`已导出（只读）：${out}`)
  db.close()
}

main()
