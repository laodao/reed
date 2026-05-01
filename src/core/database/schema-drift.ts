/**
 * Schema 漂移检查
 * @module core/database/schema-drift
 * @description 比对 Entity metadata 与实库 schema，输出差异报告。
 *              漂移报告由调用方决定如何处理（备份/终止/log）。
 *              库不存在或表不存在视为 ok=true（让 synchronize 建表）。
 */

import type { DataSource, EntityMetadata } from 'typeorm'

export interface SchemaDriftReport {
  ok: boolean
  missingTables: string[]
  missingColumns: Array<{ table: string; column: string }>
  typeMismatches: Array<{
    table: string
    column: string
    expected: string
    actual: string
  }>
}

interface ActualColumn {
  name: string
  type: string
  notNull: boolean
}

/**
 * 比对 Entity metadata 与实库 schema。
 */
export async function checkSchemaDrift(
  ds: DataSource,
): Promise<SchemaDriftReport> {
  const report: SchemaDriftReport = {
    ok: true,
    missingTables: [],
    missingColumns: [],
    typeMismatches: [],
  }

  for (const meta of ds.entityMetadatas) {
    const tableName = meta.tableName
    const actualCols = await readActualColumns(ds, tableName)
    if (actualCols === null) {
      // 表不存在 - 视为新装场景，让 synchronize 建表
      continue
    }
    checkTableColumns(meta, actualCols, report)
  }

  report.ok =
    report.missingColumns.length === 0 && report.typeMismatches.length === 0
  return report
}

async function readActualColumns(
  ds: DataSource,
  tableName: string,
): Promise<ActualColumn[] | null> {
  if (ds.options.type === 'better-sqlite3' || ds.options.type === 'sqlite') {
    const tableExists = await ds.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName],
    )
    if (!tableExists || tableExists.length === 0) return null
    const rows = await ds.query(`PRAGMA table_info(${escapeIdent(tableName)})`)
    return rows.map((r: any) => ({
      name: r.name as string,
      type: String(r.type ?? '').toUpperCase(),
      notNull: Number(r.notnull) === 1,
    }))
  }

  // postgres
  const rows = await ds.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName],
  )
  if (!rows || rows.length === 0) return null
  return rows.map((r: any) => ({
    name: r.column_name as string,
    type: String(r.data_type ?? '').toUpperCase(),
    notNull: r.is_nullable === 'NO',
  }))
}

function checkTableColumns(
  meta: EntityMetadata,
  actual: ActualColumn[],
  report: SchemaDriftReport,
): void {
  const actualMap = new Map(actual.map(c => [c.name.toLowerCase(), c]))
  for (const col of meta.columns) {
    const want = col.databaseName.toLowerCase()
    const got = actualMap.get(want)
    if (!got) {
      report.missingColumns.push({
        table: meta.tableName,
        column: col.databaseName,
      })
      continue
    }
    const expectedType = entityColumnTypeToString(col.type)
    if (!affinityEquivalent(expectedType, got.type)) {
      report.typeMismatches.push({
        table: meta.tableName,
        column: col.databaseName,
        expected: expectedType,
        actual: got.type,
      })
    }
  }
}

/**
 * Entity column.type 可能是字符串（"varchar"、"datetime" 等）
 * 也可能是 JS 类构造函数（Date、String、Number、Boolean）。
 * 统一规整为字符串供 affinity 比对。
 */
function entityColumnTypeToString(t: unknown): string {
  if (typeof t === 'string') return t
  if (typeof t === 'function') {
    const name = (t as { name?: string }).name
    if (name === 'Date') return 'datetime'
    if (name === 'String') return 'varchar'
    if (name === 'Number') return 'integer'
    if (name === 'Boolean') return 'boolean'
    return name ?? ''
  }
  return String(t ?? '')
}

/**
 * 类型 affinity 比对放宽：
 * - 整数族 / 文本族 / 浮点族 / 时间族内部互通即视为一致
 * - SQLite 历史遗留：旧库 DATETIME 列实际存的是 epoch ms 整数（Date.now()），
 *   与 TypeORM 的 bigint Entity 行为等价，单向放行；
 *   反向（Entity 是 datetime / 新库存的真日期字符串）依然按时间族走严格比对。
 */
function affinityEquivalent(expected: string, actual: string): boolean {
  const a = normalize(expected)
  const b = normalize(actual)
  if (a === b) return true
  // SQLite 旧 schema：bigint Entity vs DATETIME/TIMESTAMP 列（实存为整数 epoch ms）
  if (a === 'INT' && b === 'TIME') return true
  // SQLite 数字 affinity：INTEGER 列可承载 REAL 数据，REAL 列亦可承载 INTEGER；
  //   这里允许 Entity 声明 REAL 而旧库仍是 INTEGER（运行时无损升级）
  if (a === 'REAL' && b === 'INT') return true
  return false
}

function normalize(t: string): string {
  const s = t.toUpperCase().trim()
  if (/^(INT|INTEGER|BIGINT|SMALLINT)$/.test(s)) return 'INT'
  // simple-json / simple-array 在所有方言都存为 TEXT
  if (/^(VARCHAR|TEXT|CHARACTER VARYING|CHAR|SIMPLE-JSON|SIMPLE-ARRAY|JSON)$/.test(s))
    return 'TEXT'
  if (/^(REAL|DOUBLE|FLOAT|NUMERIC|DECIMAL|DOUBLE PRECISION)$/.test(s))
    return 'REAL'
  if (/^(DATETIME|TIMESTAMP|TIMESTAMP WITHOUT TIME ZONE)$/.test(s)) return 'TIME'
  if (/^(BLOB|BYTEA)$/.test(s)) return 'BLOB'
  if (/^(BOOLEAN|BOOL)$/.test(s)) return 'BOOL'
  return s
}

function escapeIdent(name: string): string {
  // sqlite 表名不允许通过 ? 参数化在 PRAGMA 中传入；此处只接受字母数字下划线
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table name: ${name}`)
  }
  return `"${name}"`
}
