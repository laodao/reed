/**
 * 新建 apps / app_sessions 表（应用模块，片1）
 *
 * 用途：应用 = 发布单元（来源工作流）。apps 存定义 + 四渠道开关 + 分享令牌；
 * app_sessions 存会话头（消息复用 messages 表，dialog_id=app_session.id）。
 *
 * 幂等。兼容 SQLite + PG（datetime/timestamp、varchar/TEXT）。
 */

import type { DataSource } from 'typeorm'

export async function createAppsTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'

  if (!(await checkTableExists(ds, 'apps', isPg))) {
    await ds.query(`
      CREATE TABLE apps (
        id              ${vc} PRIMARY KEY,
        user_id         ${vc},
        name            ${vc} NOT NULL,
        icon            ${vc},
        description     ${vc},
        source_kind     ${vc} NOT NULL,
        source_id       ${vc} NOT NULL,
        source_version  INTEGER,
        channel_session INTEGER DEFAULT 1,
        channel_share   INTEGER DEFAULT 0,
        channel_api     INTEGER DEFAULT 1,
        share_token     ${vc},
        enabled         INTEGER DEFAULT 1,
        last_run_at     ${dt},
        created_at      ${dt},
        updated_at      ${dt}
      )
    `)
    await ds.query(`CREATE INDEX idx_apps_user ON apps (user_id)`)
    await ds.query(`CREATE INDEX idx_apps_source ON apps (source_kind, source_id)`)
    await ds.query(`CREATE UNIQUE INDEX idx_apps_share_token ON apps (share_token)`)
    console.log('[create-apps-tables] 表 apps 创建完成')
  }

  if (!(await checkTableExists(ds, 'app_sessions', isPg))) {
    await ds.query(`
      CREATE TABLE app_sessions (
        id                ${vc} PRIMARY KEY,
        user_id           ${vc},
        app_id            ${vc} NOT NULL,
        title             ${vc} NOT NULL,
        status            ${vc} DEFAULT 'idle',
        last_run_id       ${vc},
        last_start_inputs ${vc},
        created_at        ${dt},
        updated_at        ${dt}
      )
    `)
    await ds.query(`CREATE INDEX idx_app_sessions_app ON app_sessions (app_id)`)
    console.log('[create-apps-tables] 表 app_sessions 创建完成')
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