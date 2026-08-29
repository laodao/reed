/**
 * 通用事件系统：新建 platform_events / platform_event_cursors / platform_event_dead_letters 三表
 *
 * 设计规格：tasks/2026-08-28-agent-loop-harness/10-event-system.md §4。
 * 用途：平台级事件发布/订阅/存储/重放的公共底座（非工作流引擎私有）。
 *
 * 兼容 SQLite + PG，幂等（表/索引已存在则跳过）。
 * 列类型与 Entity 声明的 affinity 族一致（schema-drift 检查按族比对）：
 * datetime ↔ DATETIME/TIMESTAMP、text ↔ TEXT、integer ↔ INTEGER、varchar ↔ TEXT/varchar。
 * PG 差异仅列类型与占位符（§4.1）：varchar/timestamp、$1,$2,...；payload 两端统一
 * text+JSON 序列化，不用 jsonb（§4.1 设计决策）。
 *
 * 接入点（新增表后必查）：
 * - Electron：src/electron/database/index.ts runMultiTenantMigrations() 追加调用
 * - Web：src/web/server/index.ts initDatabase() 追加调用（synchronize 建表后补索引）
 */

import type { DataSource } from 'typeorm'

/**
 * 创建事件系统三表（若不存在）。
 * @param ds TypeORM DataSource（SQLite 或 PostgreSQL）
 */
export async function createPlatformEventTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  await ensureTable(ds, isPg, 'platform_events', ddlEvents(isPg), () =>
    ensureEventIndexes(ds, isPg)
  )
  await ensureTable(ds, isPg, 'platform_event_cursors', ddlCursors(isPg), () =>
    ensureCursorIndexes(ds, isPg)
  )
  await ensureTable(ds, isPg, 'platform_event_dead_letters', ddlDeadLetters(isPg), () =>
    ensureDeadLetterIndexes(ds, isPg)
  )
}

// ─── 表 DDL ────────────────────────────────────────────────────────────────

function ddlEvents(pg: boolean): string {
  if (pg) {
    // §4.1：seq BIGSERIAL；注意 Web 端 synchronize 先于迁移建表时 entity(integer) 落
    // SERIAL——功能等价（int4 上限 21 亿，千条/日量级），详见文档 M1 实施记录。
    return `
      CREATE TABLE platform_events (
        seq             BIGSERIAL PRIMARY KEY,
        id              varchar NOT NULL UNIQUE,
        user_id         varchar,
        type            varchar NOT NULL,
        aggregate_kind  varchar NOT NULL,
        aggregate_id    varchar NOT NULL,
        actor_kind      varchar NOT NULL,
        actor_id        varchar,
        payload_json    text,
        causation_id    varchar,
        correlation_id  varchar,
        occurred_at     timestamp NOT NULL,
        schema_version  integer NOT NULL DEFAULT 1,
        created_at      timestamp NOT NULL
      )
    `
  }
  return `
    CREATE TABLE platform_events (
      seq             INTEGER PRIMARY KEY AUTOINCREMENT,
      id              TEXT NOT NULL UNIQUE,
      user_id         TEXT,
      type            TEXT NOT NULL,
      aggregate_kind  TEXT NOT NULL,
      aggregate_id    TEXT NOT NULL,
      actor_kind      TEXT NOT NULL,
      actor_id        TEXT,
      payload_json    TEXT,
      causation_id    TEXT,
      correlation_id  TEXT,
      occurred_at     DATETIME NOT NULL,
      schema_version  INTEGER NOT NULL DEFAULT 1,
      created_at      DATETIME NOT NULL
    )
  `
}

function ddlCursors(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE platform_event_cursors (
        id            varchar PRIMARY KEY,
        consumer_name varchar NOT NULL,
        user_scope    varchar NOT NULL DEFAULT '*',
        last_seq      integer NOT NULL DEFAULT 0,
        retrying_seq  integer,
        retry_count   integer NOT NULL DEFAULT 0,
        next_retry_at timestamp,
        last_error    text,
        updated_at    timestamp NOT NULL
      )
    `
  }
  return `
    CREATE TABLE platform_event_cursors (
      id            TEXT PRIMARY KEY,
      consumer_name TEXT NOT NULL,
      user_scope    TEXT NOT NULL DEFAULT '*',
      last_seq      INTEGER NOT NULL DEFAULT 0,
      retrying_seq  INTEGER,
      retry_count   INTEGER NOT NULL DEFAULT 0,
      next_retry_at DATETIME,
      last_error    TEXT,
      updated_at    DATETIME NOT NULL
    )
  `
}

function ddlDeadLetters(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE platform_event_dead_letters (
        id              varchar PRIMARY KEY,
        consumer_name   varchar NOT NULL,
        user_scope      varchar NOT NULL,
        event_seq       integer NOT NULL,
        event_json      text NOT NULL,
        error           text,
        attempts        integer NOT NULL,
        first_failed_at timestamp NOT NULL,
        last_failed_at  timestamp NOT NULL,
        status          varchar NOT NULL DEFAULT 'pending',
        created_at      timestamp NOT NULL
      )
    `
  }
  return `
    CREATE TABLE platform_event_dead_letters (
      id              TEXT PRIMARY KEY,
      consumer_name   TEXT NOT NULL,
      user_scope      TEXT NOT NULL,
      event_seq       INTEGER NOT NULL,
      event_json      TEXT NOT NULL,
      error           TEXT,
      attempts        INTEGER NOT NULL,
      first_failed_at DATETIME NOT NULL,
      last_failed_at  DATETIME NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      created_at      DATETIME NOT NULL
    )
  `
}

// ─── 索引（与 Entity 装饰器命名一致） ────────────────────────────────────────

async function ensureEventIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_pe_type', 'platform_events', '(type, seq)')
  await ensureIndex(
    ds,
    isPg,
    'idx_pe_aggregate',
    'platform_events',
    '(aggregate_kind, aggregate_id, seq)'
  )
  await ensureIndex(ds, isPg, 'idx_pe_user_seq', 'platform_events', '(user_id, seq)')
  await ensureIndex(ds, isPg, 'idx_pe_occurred', 'platform_events', '(occurred_at)')
}

async function ensureCursorIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  // UNIQUE：同一 (consumer_name, user_scope) 仅一条游标（user_scope 用 '*' 表达系统级，
  // 规避 SQLite 复合唯一键对 NULL 的宽松语义，§4.2）
  await ensureIndex(
    ds,
    isPg,
    'uq_pec_consumer',
    'platform_event_cursors',
    '(consumer_name, user_scope)',
    true
  )
}

async function ensureDeadLetterIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(
    ds,
    isPg,
    'idx_pedl_consumer',
    'platform_event_dead_letters',
    '(consumer_name, status)'
  )
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
  console.log(`[create-platform-event-tables] 表 ${table} 创建完成`)
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
