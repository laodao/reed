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
