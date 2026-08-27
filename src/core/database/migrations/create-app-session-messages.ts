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

  // ============ 存量数据搬迁（一次性，幂等） ============
  // 隔离改造（5e77e909）只建新表不搬旧数据：升级用户旧会话的历史消息留在
  // messages 表（dialog_id 指向 role_id='__app_session__' 的占位 dialog），
  // 读入口全关后永久不可读（报告分组 16 🟡2）。
  // 会话 id 复用占位 dialog 行 id（隔离改造前 sessionId = dialog.id）。
  // NOT EXISTS 防重复搬运；搬迁后不删旧行（清理留待产品决定，避免破坏性操作）。
  await migrateLegacySessionMessages(ds)
}

/** 把旧实现（messages + __app_session__ 占位 dialog）的会话消息搬进 app_session_messages */
async function migrateLegacySessionMessages(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const dialect = isPg
    ? `INSERT INTO app_session_messages (id, user_id, session_id, role, content, metadata, created_at)
       SELECT m.id, m.user_id, d.id, m.role, m.content, m.metadata, m.created_at
       FROM messages m
       JOIN dialogs d ON m.dialog_id = d.id
       WHERE d.role_id = $1
         AND NOT EXISTS (SELECT 1 FROM app_session_messages s WHERE s.id = m.id)`
    : `INSERT INTO app_session_messages (id, user_id, session_id, role, content, metadata, created_at)
       SELECT m.id, m.user_id, d.id, m.role, m.content, m.metadata, m.created_at
       FROM messages m
       JOIN dialogs d ON m.dialog_id = d.id
       WHERE d.role_id = ?
         AND NOT EXISTS (SELECT 1 FROM app_session_messages s WHERE s.id = m.id)`
  try {
    await ds.query(dialect, ['__app_session__'])
    console.log('[create-app-session-messages] 存量会话消息搬迁完成（幂等）')
  } catch (e) {
    // messages/dialogs 表不存在（新库无旧数据）或迁移时序差异 → 跳过不阻塞
    console.warn('[create-app-session-messages] 存量消息搬迁跳过（新库/无旧数据）:', e instanceof Error ? e.message : e)
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
