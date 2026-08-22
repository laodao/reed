/**
 * 新建 app_session_messages 表（应用会话独立消息存储，隔离 AI 对话表）
 *
 * 背景：应用会话（工作流应用）此前复用 messages 表（dialog_id 外键指向 dialogs.id），
 * 却在 dialogs 表里写 role_id='__app_session__' 的占位行，导致工作流会话混入 AI 对话列表。
 * 本迁移为应用会话建独立消息表（不再依赖 dialogs/messages），彻底隔离。
 *
 * 幂等。兼容 SQLite + PG（datetime/timestamp、varchar/TEXT）。
 */
import type { DataSource } from 'typeorm'

export async function createAppSessionMessages(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'

  if (!(await checkTableExists(ds, 'app_session_messages', isPg))) {
    await ds.query(`
      CREATE TABLE app_session_messages (
        id          ${vc} PRIMARY KEY,
        user_id     ${vc},
        session_id  ${vc} NOT NULL,
        role        ${vc} NOT NULL,
        content     ${vc} NOT NULL,
        metadata    ${vc},
        created_at  ${dt} DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('[create-app-session-messages] 表 app_session_messages 创建完成')
  }

  // 索引幂等补建
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_app_session_messages_session ON app_session_messages (session_id)`)
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
