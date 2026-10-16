/**
 * 新建 tool_credentials / custom_tools 表（P0 片1：第三方 API 工具）
 *
 * 用途：凭据库（api_key 加密存储）+ 自定义工具封装（方法/URL/请求头/参数 schema/鉴权方式）。
 * 幂等。兼容 SQLite + PG（varchar/TEXT、datetime/timestamp）。
 */

import type { DataSource } from 'typeorm'

export async function createToolTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'

  if (!(await checkTableExists(ds, 'tool_credentials', isPg))) {
    await ds.query(`
      CREATE TABLE tool_credentials (
        id          ${vc} PRIMARY KEY,
        user_id     ${vc},
        name        ${vc} NOT NULL,
        api_key_enc ${vc} NOT NULL,
        base_url    ${vc},
        created_at  ${dt},
        updated_at  ${dt}
      )
    `)
    console.log('[create-tool-tables] 表 tool_credentials 创建完成')
  }

  if (!(await checkTableExists(ds, 'custom_tools', isPg))) {
    await ds.query(`
      CREATE TABLE custom_tools (
        id               ${vc} PRIMARY KEY,
        user_id          ${vc},
        name             ${vc} NOT NULL,
        description      ${vc},
        kind             ${vc},
        method           ${vc} NOT NULL,
        url              ${vc} NOT NULL,
        headers_json     ${vc} NOT NULL,
        params_schema_json ${vc} NOT NULL,
        auth_type        ${vc} NOT NULL,
        credential_id    ${vc},
        command          ${vc},
        args_template    ${vc},
        cwd              ${vc},
        timeout_ms       INTEGER,
        stdout_type      ${vc},
        created_at       ${dt},
        updated_at       ${dt}
      )
    `)
    console.log('[create-tool-tables] 表 custom_tools 创建完成')
  } else {
    // 旧库已有 custom_tools：幂等补 CLI 工具列
    await addColumnIfMissing(ds, 'custom_tools', 'kind', vc, isPg)
    await addColumnIfMissing(ds, 'custom_tools', 'command', vc, isPg)
    await addColumnIfMissing(ds, 'custom_tools', 'args_template', vc, isPg)
    await addColumnIfMissing(ds, 'custom_tools', 'cwd', vc, isPg)
    await addColumnIfMissing(ds, 'custom_tools', 'timeout_ms', 'INTEGER', isPg)
    await addColumnIfMissing(ds, 'custom_tools', 'stdout_type', vc, isPg)
    console.log('[create-tool-tables] custom_tools CLI 列补齐完成')
  }

  // 索引幂等补建（表存在但索引缺失也能补齐）
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_custom_tools_user ON custom_tools (user_id)`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_tool_credentials_user ON tool_credentials (user_id)`)
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

/** 幂等加列：列不存在才 ADD COLUMN（兼容 SQLite + PG） */
async function addColumnIfMissing(ds: DataSource, table: string, col: string, type: string, isPg: boolean): Promise<void> {
  if (await checkColumnExists(ds, table, col, isPg)) return
  try {
    await ds.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`)
  } catch {
    // 并发/重复执行容错：列已存在则忽略
  }
}

async function checkColumnExists(ds: DataSource, table: string, col: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
      [table, col],
    )
    return rows.length > 0
  }
  const rows = await ds.query(`PRAGMA table_info(${table})`) as Array<{ name: string }>
  return rows.some(r => r.name === col)
}
