/**
 * settings 表旧版 schema 迁移（key 主键统一）
 *
 * 背景：旧版本 PC 库的 settings 表是「全功能实体」结构：
 *   id TEXT PRIMARY KEY NOT NULL, key TEXT, value TEXT, created_at, updated_at,
 *   deleted_at, user_id, category, description
 * 而当前 SettingsEntity（settings.entity.ts）以 key 为主键，TypeORM 的
 * repo.save({ key, value }) 对已存在键走 UPDATE（一直正常），对**新键**走
 * INSERT（不提供 id）→ SQLite 报 `NOT NULL constraint failed: settings.id`，
 * 表现为「新增设置项保存失败」（例如切换皮肤 skin）。
 * `CREATE TABLE IF NOT EXISTS` 不会重建已存在的旧表，因此必须显式迁移。
 *
 * 方案：检测到 settings 表含 id 列（旧 schema 特征）时，在单事务内
 * 建新表 settings_new(key TEXT PRIMARY KEY, value TEXT NOT NULL,
 * updated_at DATETIME DEFAULT CURRENT_TIMESTAMP) → 拷贝 key/value/updated_at
 * → 删旧表 → 重命名。幂等：迁移完成后无 id 列，下次启动直接跳过。
 * 旧表其余列（user_id/category/description 等）经核实全为 NULL，不参与拷贝。
 *
 * 兼容：接受任意提供 exec/prepare 的 sqlite 句柄（better-sqlite3 与
 * node:sqlite 均可），不依赖 TypeORM，可在启动建表后立即调用。
 */

/** sqlite 句柄最小接口（better-sqlite3 与 node:sqlite 均满足） */
export interface SqliteLikeDb {
  exec(sql: string): unknown
  prepare(sql: string): {
    all(...params: unknown[]): Array<Record<string, unknown>>
  }
}

/**
 * 迁移旧版 settings 表。返回是否执行了迁移（true=旧表已重建，false=无需迁移）。
 * 幂等且不抛错（无表/新 schema 均视为无需迁移）。
 */
export function migrateLegacySettingsTable(db: SqliteLikeDb): boolean {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='settings'`)
    .all()
  if (tableExists.length === 0) return false

  const cols = db.prepare(`PRAGMA table_info(settings)`).all()
  if (!cols.some((c: Record<string, unknown>) => c.name === 'id')) {
    // 已是 key 主键新结构（或包含 key 主键的变体），无需迁移
    return false
  }

  console.log('[migrate-legacy-settings-table] 检测到旧版 settings 表（id 主键），开始重建...')
  db.exec('BEGIN')
  try {
    db.exec(`
      CREATE TABLE settings_new (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    db.exec(`
      INSERT INTO settings_new (key, value, updated_at)
      SELECT key, value, COALESCE(updated_at, CURRENT_TIMESTAMP) FROM settings
    `)
    db.exec('DROP TABLE settings')
    db.exec('ALTER TABLE settings_new RENAME TO settings')
    db.exec('COMMIT')
    console.log('[migrate-legacy-settings-table] settings 表迁移完成（key 主键）')
    return true
  } catch (e) {
    db.exec('ROLLBACK')
    console.error('[migrate-legacy-settings-table] settings 表迁移失败，已回滚:', e)
    throw e
  }
}
