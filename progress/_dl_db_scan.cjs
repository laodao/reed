// 通用探针：列出指定库里所有领域学习空间及其概念规模（可传多个库路径）
const Database = require('better-sqlite3')

const paths = process.argv.slice(2)
if (!paths.length) {
  console.log('用法: electron scripts/_dl_db_scan.cjs <db 路径> [...]')
  process.exit(1)
}

for (const p of paths) {
  console.log(`\n================ ${p}`)
  let db
  try {
    db = new Database(p, { readonly: true })
  } catch (e) {
    console.log('  打不开：', e.message)
    continue
  }
  const has = db
    .prepare("select count(*) as n from sqlite_master where type='table' and name='dl_project'")
    .get().n
  if (!has) {
    console.log('  无 dl_project 表')
    continue
  }
  const projects = db.prepare('select * from dl_project order by created_at').all()
  for (const pr of projects) {
    const n = db.prepare('select count(*) as n from dl_concept where project_id = ?').get(pr.id).n
    const g = db
      .prepare("select count(*) as n from dl_concept where project_id = ? and node_type = 'group'")
      .get(pr.id).n
    const r = db.prepare('select count(*) as n from dl_relation where project_id = ?').get(pr.id).n
    const c = db.prepare('select count(*) as n from dl_card where project_id = ?').get(pr.id).n
    console.log(
      `  ${pr.name} | created=${pr.created_at} | 概念=${n} 分组=${g} 关系=${r} 卡=${c} | goal=${pr.goal}`
    )
    const rows = db
      .prepare(
        "select name, node_type, parent_id from dl_concept where project_id = ? and node_type <> 'group' order by created_at"
      )
      .all(pr.id)
    const names = rows.map((x) => x.name)
    console.log('    概念：', names.slice(0, 30).join('、') + (names.length > 30 ? ` …(共${names.length})` : ''))
    // 一次成型还是逐次累加：概念创建时间跨度（同一天内一次性落库 → days=1）
    const span = db
      .prepare(
        `select min(created_at) first, max(created_at) last,
                count(distinct substr(created_at, 1, 10)) days
         from dl_concept where project_id = ?`
      )
      .get(pr.id)
    console.log(`    时间跨度：${span.first} → ${span.last}（不同日期数=${span.days}）`)
  }
}
