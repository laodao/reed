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
        method           ${vc} NOT NULL,
        url              ${vc} NOT NULL,
        headers_json     ${vc} NOT NULL,
        params_schema_json ${vc} NOT NULL,
        auth_type        ${vc} NOT NULL,
        credential_id    ${vc},
        created_at       ${dt},
        updated_at       ${dt}
      )
    `)
    console.log('[create-tool-tables] 表 custom_tools 创建完成')
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
