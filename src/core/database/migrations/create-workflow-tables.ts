/**
 * 工作流引擎：新建 workflow_definitions / workflow_runs / workflow_node_runs 三表
 *
 * 用途：工作流定义（草稿/发布双图 + 触发器 + cron 调度状态）、运行实例
 * （图快照 + 状态机 + 防失控死线）、节点级 checkpoint（断点续跑的事实源）。
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
 * 创建工作流三表（若不存在）。
 * @param ds TypeORM DataSource（SQLite 或 PostgreSQL）
 */
export async function createWorkflowTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  await ensureTable(ds, isPg, 'workflow_definitions', ddlDefinitions(isPg), () =>
    ensureDefinitionIndexes(ds, isPg)
  )
  await ensureTable(ds, isPg, 'workflow_runs', ddlRuns(isPg), () => ensureRunIndexes(ds, isPg))
  await ensureTable(ds, isPg, 'workflow_node_runs', ddlNodeRuns(isPg), () =>
    ensureNodeRunIndexes(ds, isPg)
  )
}

// ─── 表 DDL ────────────────────────────────────────────────────────────────

function ddlDefinitions(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE workflow_definitions (
        id                varchar PRIMARY KEY,
        user_id           varchar,
        name              varchar NOT NULL,
        description       text,
        category          varchar,
        draft_graph       text,
        published_graph   text,
        published_version integer NOT NULL DEFAULT 0,
        published_at      timestamp,
        triggers          text,
        settings          text,
        next_fire_at      timestamp,
        last_fire_at      timestamp,
        last_run_at       timestamp,
        created_at        timestamp,
        updated_at        timestamp
      )
    `
  }
  return `
    CREATE TABLE workflow_definitions (
      id                TEXT PRIMARY KEY,
      user_id           TEXT,
      name              TEXT NOT NULL,
      description       TEXT,
      category          TEXT,
      draft_graph       TEXT,
      published_graph   TEXT,
      published_version INTEGER NOT NULL DEFAULT 0,
      published_at      DATETIME,
      triggers          TEXT,
      settings          TEXT,
      next_fire_at      DATETIME,
      last_fire_at      DATETIME,
      last_run_at       DATETIME,
      created_at        DATETIME,
      updated_at        DATETIME
    )
  `
}

function ddlRuns(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE workflow_runs (
        id                  varchar PRIMARY KEY,
        user_id             varchar,
        definition_id       varchar NOT NULL,
        definition_version  integer NOT NULL,
        graph_snapshot      text NOT NULL,
        trigger_type        varchar NOT NULL,
        trigger_info        text,
        start_inputs        text,
        status              varchar NOT NULL,
        skip_reason         varchar,
        error               text,
        started_at          timestamp,
        finished_at         timestamp,
        duration_ms         integer,
        timeout_at          timestamp,
        stats               text,
        cancel_requested_at timestamp,
        resumed_from_run_id varchar,
        created_at          timestamp,
        updated_at          timestamp
      )
    `
  }
  return `
    CREATE TABLE workflow_runs (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT,
      definition_id       TEXT NOT NULL,
      definition_version  INTEGER NOT NULL,
      graph_snapshot      TEXT NOT NULL,
      trigger_type        TEXT NOT NULL,
      trigger_info        TEXT,
      start_inputs        TEXT,
      status              TEXT NOT NULL,
      skip_reason         TEXT,
      error               TEXT,
      started_at          DATETIME,
      finished_at         DATETIME,
      duration_ms         INTEGER,
      timeout_at          DATETIME,
      stats               TEXT,
      cancel_requested_at DATETIME,
      resumed_from_run_id TEXT,
      created_at          DATETIME,
      updated_at          DATETIME
    )
  `
}

function ddlNodeRuns(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE workflow_node_runs (
        id              varchar PRIMARY KEY,
        user_id         varchar,
        run_id          varchar NOT NULL,
        node_id         varchar NOT NULL,
        node_type       varchar NOT NULL,
        node_name       varchar NOT NULL,
        iteration_index integer NOT NULL DEFAULT 0,
        status          varchar NOT NULL,
        input_json      text,
        output_json     text,
        error           text,
        retry_count     integer NOT NULL DEFAULT 0,
        route_taken     varchar,
        wait_expires_at timestamp,
        review          text,
        started_at      timestamp,
        finished_at     timestamp,
        duration_ms     integer,
        created_at      timestamp,
        updated_at      timestamp
      )
    `
  }
  return `
    CREATE TABLE workflow_node_runs (
      id              TEXT PRIMARY KEY,
      user_id         TEXT,
      run_id          TEXT NOT NULL,
      node_id         TEXT NOT NULL,
      node_type       TEXT NOT NULL,
      node_name       TEXT NOT NULL,
      iteration_index INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL,
      input_json      TEXT,
      output_json     TEXT,
      error           TEXT,
      retry_count     INTEGER NOT NULL DEFAULT 0,
      route_taken     TEXT,
      wait_expires_at DATETIME,
      review          TEXT,
      started_at      DATETIME,
      finished_at     DATETIME,
      duration_ms     INTEGER,
      created_at      DATETIME,
      updated_at      DATETIME
    )
  `
}

// ─── 索引（与 Entity 装饰器命名一致） ────────────────────────────────────────

async function ensureDefinitionIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_wf_def_user', 'workflow_definitions', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_wf_def_next_fire', 'workflow_definitions', '(next_fire_at)')
}

async function ensureRunIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_wf_run_user', 'workflow_runs', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_wf_run_def_status', 'workflow_runs', '(definition_id, status)')
  await ensureIndex(ds, isPg, 'idx_wf_run_status', 'workflow_runs', '(status)')
}

async function ensureNodeRunIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_wf_noderun_user', 'workflow_node_runs', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_wf_noderun_run', 'workflow_node_runs', '(run_id)')
  await ensureIndex(ds, isPg, 'idx_wf_noderun_wait', 'workflow_node_runs', '(wait_expires_at)')
  // UNIQUE：一次运行中 (run_id, node_id, iteration_index) 唯一——引擎重复建行属 bug，靠约束兜底
  await ensureIndex(
    ds,
    isPg,
    'uq_wf_noderun_exec',
    'workflow_node_runs',
    '(run_id, node_id, iteration_index)',
    true
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
  console.log(`[create-workflow-tables] 表 ${table} 创建完成`)
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
