/**
 * 新建 email_accounts 表（邮件收发：SMTP 发 / IMAP 收，授权码认证）
 *
 * 用途：邮箱账号库（IMAP 与 SMTP 服务器分开配置，授权码/密码 pass_enc 加密存储）。
 * 幂等。兼容 SQLite + PG（varchar/TEXT、datetime/timestamp、INTEGER/BOOLEAN）。
 */

import type { DataSource } from 'typeorm'

export async function createEmailTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'
  const bl = isPg ? 'BOOLEAN' : 'INTEGER'

  if (!(await checkTableExists(ds, 'email_accounts', isPg))) {
    await ds.query(`
      CREATE TABLE email_accounts (
        id          ${vc} PRIMARY KEY,
        user_id     ${vc},
        name        ${vc} NOT NULL,
        host        ${vc},
        imap_host   ${vc} NOT NULL,
        imap_port   INTEGER NOT NULL,
        imap_secure ${bl} NOT NULL DEFAULT 1,
        smtp_host   ${vc} NOT NULL,
        smtp_port   INTEGER NOT NULL,
        smtp_secure ${bl} NOT NULL DEFAULT 1,
        user        ${vc} NOT NULL,
        pass_enc    ${vc} NOT NULL,
        from_name   ${vc},
        created_at  ${dt},
        updated_at  ${dt}
      )
    `)
    console.log('[create-email-tables] 表 email_accounts 创建完成')
  }

  // 索引幂等补建（表存在但索引缺失也能补齐）
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts (user_id)`)
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
