/**
 * 新建 wf_variables / wf_data_table_defs / wf_data_table_rows 表（P0 片4：变量与数据表）
 * 幂等。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function createVariableTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'

  if (!(await checkTableExists(ds, 'wf_variables', isPg))) {
    await ds.query(`
      CREATE TABLE wf_variables (
        id          ${vc} PRIMARY KEY,
        user_id     ${vc},
        scope       ${vc} NOT NULL,
        key         ${vc} NOT NULL,
        value_json  ${vc} NOT NULL,
        created_at  ${dt},
        updated_at  ${dt}
      )
    `)
    console.log('[create-variable-tables] 表 wf_variables 创建完成')
  }
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_wf_variables_user ON wf_variables (user_id)`)

  if (!(await checkTableExists(ds, 'wf_data_table_defs', isPg))) {
    await ds.query(`
      CREATE TABLE wf_data_table_defs (
        id           ${vc} PRIMARY KEY,
        user_id      ${vc},
        name         ${vc} NOT NULL,
        columns_json ${vc} NOT NULL,
        created_at   ${dt},
        updated_at   ${dt}
      )
    `)
    console.log('[create-variable-tables] 表 wf_data_table_defs 创建完成')
  }
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_wf_data_table_defs_user ON wf_data_table_defs (user_id)`)

  if (!(await checkTableExists(ds, 'wf_data_table_rows', isPg))) {
    await ds.query(`
      CREATE TABLE wf_data_table_rows (
        id         ${vc} PRIMARY KEY,
        user_id    ${vc},
        table_id   ${vc} NOT NULL,
        row_json   ${vc} NOT NULL,
        created_at ${dt},
        updated_at ${dt}
      )
    `)
    console.log('[create-variable-tables] 表 wf_data_table_rows 创建完成')
  }
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_wf_data_table_rows_table ON wf_data_table_rows (table_id)`)

  // ===== 应用数据层补列与索引（2026-10-08，设计 §3.2；幂等）=====
  await ensureColumn(ds, 'wf_data_table_defs', 'scope', `${vc} DEFAULT 'workflow'`, isPg)
  await ensureColumn(ds, 'wf_data_table_defs', 'owner_id', vc, isPg)
  await ensureColumn(ds, 'wf_data_table_defs', 'dedup_keys_json', vc, isPg)
  await ensureColumn(ds, 'wf_data_table_rows', 'dedup_hash', vc, isPg)
  // 作用域内表名唯一（NULL owner 在 SQLite/PG 唯一索引中互不冲突，workflow 作用域维持按名全局唯一）
  await ds.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_wf_dt_scope_owner_name ON wf_data_table_defs (scope, owner_id, name)`,
  )
  // 同表去重键唯一（upsert 并发兜底；NULL 互不冲突，不阻碍无去重键的表）
  await ds.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_wf_dt_rows_dedup ON wf_data_table_rows (table_id, dedup_hash)`,
  )
}

/** 幂等补列（SQLite: PRAGMA 查列；PG: information_schema；与 create-apps-tables 同款写法） */
async function ensureColumn(
  ds: DataSource,
  table: string,
  column: string,
  colDef: string,
  isPg: boolean,
): Promise<void> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
      [table, column],
    )
    if (rows.length === 0) {
      await ds.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef}`)
      console.log(`[create-variable-tables] ${table} 补列 ${column}`)
    }
    return
  }
  const cols = await ds.query(`PRAGMA table_info(${table})`)
  if (!cols.some((c: { name: string }) => c.name === column)) {
    await ds.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef}`)
    console.log(`[create-variable-tables] ${table} 补列 ${column}`)
  }
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
  return rows.length > 0
}
