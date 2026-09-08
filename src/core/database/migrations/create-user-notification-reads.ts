/**
 * 通知中心：新建 user_notification_reads 表（用户已读状态独立持久化）
 *
 * 设计规格：tasks/2026-08-28-agent-loop-harness/10-event-system.md（通知模块落于事件表之上）。
 * 用途：平台事件表 platform_events 为通知历史数据源；用户已读状态单独落表，
 *       一行 = 当前用户对某条事件(seq)的已读标记，复合主键 (user_id, seq)。
 *
 * 兼容 SQLite + PG，幂等（表/索引已存在则跳过）。
 * 列类型与 Entity 声明的 affinity 族一致（schema-drift 检查按族比对）：
 * datetime ↔ DATETIME/TIMESTAMP、text ↔ TEXT、integer ↔ INTEGER、varchar ↔ TEXT/varchar。
 *
 * 接入点（新增表后必查）：
 * - Electron：src/electron/database/index.ts runMultiTenantMigrations() 追加调用
 * - Web：src/web/server/index.ts initDatabase() 追加调用（synchronize 建表后补索引）
 */

import type { DataSource } from 'typeorm'

/**
 * 创建通知已读状态表（若不存在）。
 * @param ds TypeORM DataSource（SQLite 或 PostgreSQL）
 */
export async function createUserNotificationReads(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  await ensureTable(ds, isPg, 'user_notification_reads', ddl(isPg), () =>
    ensureIndexes(ds, isPg)
  )
}

// ─── 表 DDL ────────────────────────────────────────────────────────────────

function ddl(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE user_notification_reads (
        user_id varchar NOT NULL,
        seq     integer NOT NULL,
        read_at timestamp NOT NULL,
        PRIMARY KEY (user_id, seq)
      )
    `
  }
  return `
    CREATE TABLE user_notification_reads (
      user_id TEXT NOT NULL,
      seq     INTEGER NOT NULL,
      read_at DATETIME NOT NULL,
      PRIMARY KEY (user_id, seq)
    )
  `
}

// ─── 索引（与 Entity 装饰器命名一致） ───────────────────────────────────────

async function ensureIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  // 通知列表/未读数按用户聚合（WHERE user_id = ?），复合主键 (user_id, seq) 已覆盖该前缀；
  // 仍补一个显式 user_id 索引，便于将来按 read_at 扩展扫描（比对 schema-drift 契约）。
  await ensureIndex(ds, isPg, 'idx_unr_user', 'user_notification_reads', '(user_id)')
}

// ─── 内部工具（与项目其他 migration 同风格） ─────────────────────────────────

async function ensureTable(
  ds: DataSource,
  isPg: boolean,
  table: string,
  ddl: string,
  onExists: () => Promise<void>
): Promise<void> {
  const exists = await checkTableExists(ds, table, isPg)
  if (exists) {
    await onExists() // 表已存在 → 确保索引也存在（补齐旧库）
    return
  }
  await ds.query(ddl)
  await onExists()
  console.log(`[create-user-notification-reads] 表 ${table} 创建完成`)
}

async function checkTableExists(
  ds: DataSource,
  table: string,
  isPg: boolean
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table]
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [table]
  )
  return rows.length > 0
}

async function checkIndexExists(
  ds: DataSource,
  indexName: string,
  isPg: boolean
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1 AND schemaname = current_schema() LIMIT 1`,
      [indexName]
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type='index' AND name = ? LIMIT 1`,
    [indexName]
  )
  return rows.length > 0
}

async function ensureIndex(
  ds: DataSource,
  isPg: boolean,
  indexName: string,
  table: string,
  columns: string,
  unique = false
): Promise<void> {
  if (await checkIndexExists(ds, indexName, isPg)) return
  const uniqueKw = unique ? 'UNIQUE ' : ''
  try {
    await ds.query(`CREATE ${uniqueKw}INDEX ${indexName} ON ${table} ${columns}`)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    // 索引可能已由 entity synchronize 建过（如 sqlite 测试库），忽略冲突
    if (!/already exists|duplicate/i.test(message)) throw e
  }
}
