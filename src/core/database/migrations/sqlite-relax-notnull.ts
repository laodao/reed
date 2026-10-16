/**
 * SQLite 列级 NOT NULL 放开工具（表重建）
 *
 * 背景：SQLite 不支持 ALTER COLUMN 改约束。typeorm `synchronize` 只对开发期新库生效，
 * 生产用户库（~/.config/the_bot/the_bot.db）的既有 NOT NULL 约束不会被改写，
 * 必须显式重建表：建新表（目标列去掉 NOT NULL）→ 拷数据 → DROP 旧表 → 改名 → 重建索引/触发器。
 *
 * 流程遵循 sqlite.org 推荐的 12 步 ALTER 规程（foreign_keys 在事务外关闭）。
 * 幂等：列已是 nullable 时直接返回 'already-nullable'，不做任何 DDL。
 * 数据 / 索引 / 触发器 / 外键定义全部保留（新表 DDL 由旧表 sqlite_master.sql 改写得来）。
 */

import type { DataSource } from 'typeorm'

export type SqliteRelaxResult = 'rebuilt' | 'already-nullable' | 'missing'

/**
 * 放开 SQLite 表上某列的 NOT NULL 约束。
 * 仅供 SQLite DataSource 调用；PG 请走 ALTER COLUMN DROP NOT NULL。
 */
export async function relaxSqliteNotNull(
  ds: DataSource,
  table: string,
  column: string,
): Promise<SqliteRelaxResult> {
  const tableRows = await ds.query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [table],
  )
  if (tableRows.length === 0) return 'missing'

  const colRows = await ds.query(
    `SELECT "notnull" FROM pragma_table_info(?) WHERE name = ? LIMIT 1`,
    [table, column],
  )
  if (colRows.length === 0) return 'missing'
  if (colRows[0].notnull === 0) return 'already-nullable'

  const sqlRows = await ds.query(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [table],
  )
  const createSql: string | undefined = sqlRows[0]?.sql
  if (!createSql) {
    throw new Error(`[relax-sqlite-notnull] 取不到 ${table} 的建表语句，无法重建`)
  }
  const tmpTable = `${table}__relax_rebuild`
  const newSql = rewriteCreateTableSql(createSql, tmpTable, column)
  if (!newSql) {
    throw new Error(
      `[relax-sqlite-notnull] 无法在 ${table} 的建表语句中定位 ${column} 的 NOT NULL，放弃重建`,
    )
  }

  // 既有索引 / 触发器随 DROP 旧表消失，需在改名后按原定义重建
  const indexSqls: string[] = (
    await ds.query(
      `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`,
      [table],
    )
  ).map((r: { sql: string }) => r.sql)
  const triggerSqls: string[] = (
    await ds.query(
      `SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND sql IS NOT NULL`,
      [table],
    )
  ).map((r: { sql: string }) => r.sql)

  // 清理上次失败可能残留的临时表（幂等保证）
  await ds.query(`DROP TABLE IF EXISTS "${tmpTable}"`)

  // foreign_keys 必须在事务外关闭（事务内 PRAGMA foreign_keys 是 no-op）
  await ds.query(`PRAGMA foreign_keys = OFF`)
  await ds.query(`BEGIN`)
  try {
    await ds.query(newSql)
    await ds.query(`INSERT INTO "${tmpTable}" SELECT * FROM "${table}"`)
    await ds.query(`DROP TABLE "${table}"`)
    await ds.query(`ALTER TABLE "${tmpTable}" RENAME TO "${table}"`)
    for (const sql of indexSqls) await ds.query(sql)
    for (const sql of triggerSqls) await ds.query(sql)
    await ds.query(`COMMIT`)
  } catch (e) {
    await ds.query(`ROLLBACK`).catch(() => {})
    throw e
  } finally {
    await ds.query(`PRAGMA foreign_keys = ON`)
  }
  return 'rebuilt'
}

/**
 * 改写 CREATE TABLE 语句：换新表名 + 去掉目标列定义里的 NOT NULL。
 * 返回 null 表示无法安全改写（调用方应报错而不是默默跳过）。
 */
function rewriteCreateTableSql(
  sql: string,
  tmpTable: string,
  column: string,
): string | null {
  // 1) 表名替换（CREATE TABLE [IF NOT EXISTS] "name" / [name] / `name` / bare）
  const out = sql.replace(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"[^"]+"|\[[^\]]+\]|`[^`]+`|[\w$]+)/i,
    `CREATE TABLE "${tmpTable}"`,
  )
  if (!out.includes(`"${tmpTable}"`)) return null

  // 2) 目标列列级约束去掉 NOT NULL。
  // 列定义内不含逗号（本工具只用于简单标量列），[^,]*? 惰性匹配安全；
  // 列定义在 CREATE TABLE 中先于表级约束（PRIMARY KEY/FOREIGN KEY/UNIQUE 子句）出现，
  // 且表级约束子句不含 NOT NULL 形态，首个匹配即列定义。
  const colRe = new RegExp(
    `("${column}"|\\[${column}\\]|\`${column}\`|\\b${column}\\b)[^,]*?\\s+NOT\\s+NULL`,
    'i',
  )
  const m = out.match(colRe)
  if (!m || m.index === undefined) return null
  const stripped = m[0].replace(/\s+NOT\s+NULL/i, '')
  return out.slice(0, m.index) + stripped + out.slice(m.index + m[0].length)
}
