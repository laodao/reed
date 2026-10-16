/**
 * 信息搜集表（ic_projects/ic_tasks/ic_task_passes/ic_sources/ic_rows，共 5 张）
 *
 * 数据模型见 docs/design/2026-10-07-info-collection-design.md §2.3 +
 * docs/design/2026-10-07-info-collection-storage-design.md §2/§3。
 * 内容唯一存储在知识库；ic_* 只存过程治理元数据（审阅状态/转载簇/刷新游标/台账）。
 *
 * 兼容 SQLite + PG，幂等（ensureTable/ensureIndex）。接入点：
 * electron runMultiTenantMigrations / web initDatabase（两处同构登记，缺一即崩）。
 */
import type { DataSource } from 'typeorm'
import { ensureTable, ensureIndex, ensureColumn } from './migration-utils'

/** 创建全部 5 张 ic_* 表（若不存在）。 */
export async function createInfoCollectionTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  await ensureTable(ds, isPg, 'ic_projects', ddlProjects(isPg), () => projectsIndexes(ds, isPg))
  await ensureTable(ds, isPg, 'ic_tasks', ddlTasks(isPg), () => tasksIndexes(ds, isPg))
  await ensureTable(ds, isPg, 'ic_task_passes', ddlPasses(isPg), () => passesIndexes(ds, isPg))
  await ensureTable(ds, isPg, 'ic_sources', ddlSources(isPg), () => sourcesIndexes(ds, isPg))
  await ensureTable(ds, isPg, 'ic_rows', ddlRows(isPg), () => rowsIndexes(ds, isPg))
  // M2 质量层：孤证标记 + 裁决备注（老库升级路径——ensureTable 只补索引，新增列显式 ALTER，幂等）
  await ensureColumn(
    ds,
    isPg,
    'ic_rows',
    'single_source',
    isPg ? 'single_source integer NOT NULL DEFAULT 0' : 'single_source INTEGER NOT NULL DEFAULT 0',
  )
  await ensureColumn(
    ds,
    isPg,
    'ic_rows',
    'review_note',
    isPg ? 'review_note text' : 'review_note TEXT',
  )
  // M3 多模态：来源 → 统一资产登记外链（老库升级路径；新表 DDL 已含此列）
  await ensureColumn(
    ds,
    isPg,
    'ic_sources',
    'asset_id',
    isPg ? 'asset_id varchar' : 'asset_id TEXT',
  )
}

// ==================== ic_projects ====================

function ddlProjects(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE ic_projects (
        id                varchar PRIMARY KEY,
        user_id           varchar,
        name              varchar NOT NULL,
        goal              text NOT NULL,
        blueprint_json    text NOT NULL,
        blueprint_version integer NOT NULL DEFAULT 1,
        kb_id             varchar,
        refresh_policy_json text,
        status            varchar NOT NULL DEFAULT 'active',
        created_at        timestamp,
        updated_at        timestamp
      )
    `
  }
  return `
    CREATE TABLE ic_projects (
      id                TEXT PRIMARY KEY,
      user_id           TEXT,
      name              TEXT NOT NULL,
      goal              TEXT NOT NULL,
      blueprint_json    TEXT NOT NULL,
      blueprint_version INTEGER NOT NULL DEFAULT 1,
      kb_id             TEXT,
      refresh_policy_json TEXT,
      status            TEXT NOT NULL DEFAULT 'active',
      created_at        DATETIME,
      updated_at        DATETIME
    )
  `
}

async function projectsIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_ic_projects_user', 'ic_projects', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_ic_projects_user_status', 'ic_projects', '(user_id, status)')
}

// ==================== ic_tasks ====================

function ddlTasks(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE ic_tasks (
        id                varchar PRIMARY KEY,
        user_id           varchar,
        project_id        varchar NOT NULL,
        blueprint_version integer NOT NULL DEFAULT 1,
        run_id            varchar,
        status            varchar NOT NULL DEFAULT 'pending',
        stats_json        text,
        created_at        timestamp,
        finished_at       timestamp
      )
    `
  }
  return `
    CREATE TABLE ic_tasks (
      id                TEXT PRIMARY KEY,
      user_id           TEXT,
      project_id        TEXT NOT NULL,
      blueprint_version INTEGER NOT NULL DEFAULT 1,
      run_id            TEXT,
      status            TEXT NOT NULL DEFAULT 'pending',
      stats_json        TEXT,
      created_at        DATETIME,
      finished_at       DATETIME
    )
  `
}

async function tasksIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_ic_tasks_user', 'ic_tasks', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_ic_tasks_project_status', 'ic_tasks', '(project_id, status)')
}

// ==================== ic_task_passes（幂等台账，照搬 kb_digest_passes） ====================

function ddlPasses(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE ic_task_passes (
        id          varchar PRIMARY KEY,
        user_id     varchar,
        project_id  varchar NOT NULL,
        task_id     varchar NOT NULL,
        pass_key    varchar NOT NULL,
        attempt     integer NOT NULL DEFAULT 1,
        status      varchar NOT NULL DEFAULT 'running',
        stats_json  text,
        cost_json   text,
        started_at  timestamp,
        finished_at timestamp
      )
    `
  }
  return `
    CREATE TABLE ic_task_passes (
      id          TEXT PRIMARY KEY,
      user_id     TEXT,
      project_id  TEXT NOT NULL,
      task_id     TEXT NOT NULL,
      pass_key    TEXT NOT NULL,
      attempt     INTEGER NOT NULL DEFAULT 1,
      status      TEXT NOT NULL DEFAULT 'running',
      stats_json  TEXT,
      cost_json   TEXT,
      started_at  DATETIME,
      finished_at DATETIME
    )
  `
}

async function passesIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_ic_passes_user', 'ic_task_passes', '(user_id)')
  // 幂等键：同遍次重跑 attempt 递增，不重复入库
  await ensureIndex(ds, isPg, 'uniq_ic_passes_task_pass_attempt', 'ic_task_passes', '(task_id, pass_key, attempt)', true)
}

// ==================== ic_sources ====================

function ddlSources(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE ic_sources (
        id               varchar PRIMARY KEY,
        user_id          varchar,
        project_id       varchar NOT NULL,
        task_id          varchar NOT NULL,
        url              text NOT NULL,
        url_normalized   text NOT NULL,
        tier             integer,
        tier_rationale   text,
        is_primary       integer NOT NULL DEFAULT 0,
        cluster_id       varchar,
        published_at     timestamp,
        collected_at     timestamp,
        snapshot_path    text,
        content_hash     varchar,
        text_fingerprint text,
        fetch_status     varchar NOT NULL DEFAULT 'ok',
        review_status    varchar NOT NULL DEFAULT 'staged',
        kb_document_id   varchar,
        asset_id         varchar,
        ir_hits_json     text,
        created_at       timestamp,
        updated_at       timestamp
      )
    `
  }
  return `
    CREATE TABLE ic_sources (
      id               TEXT PRIMARY KEY,
      user_id          TEXT,
      project_id       TEXT NOT NULL,
      task_id          TEXT NOT NULL,
      url              TEXT NOT NULL,
      url_normalized   TEXT NOT NULL,
      tier             INTEGER,
      tier_rationale   TEXT,
      is_primary       INTEGER NOT NULL DEFAULT 0,
      cluster_id       TEXT,
      published_at     DATETIME,
      collected_at     DATETIME,
      snapshot_path    TEXT,
      content_hash     TEXT,
      text_fingerprint TEXT,
      fetch_status     TEXT NOT NULL DEFAULT 'ok',
      review_status    TEXT NOT NULL DEFAULT 'staged',
      kb_document_id   TEXT,
      asset_id         TEXT,
      ir_hits_json     TEXT,
      created_at       DATETIME,
      updated_at       DATETIME
    )
  `
}

async function sourcesIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_ic_sources_user', 'ic_sources', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_ic_sources_project_review', 'ic_sources', '(project_id, review_status)')
  // 增量跳过与去重键；不唯一（刷新策略可要求重访）
  await ensureIndex(ds, isPg, 'idx_ic_sources_url', 'ic_sources', '(url_normalized)')
  await ensureIndex(ds, isPg, 'idx_ic_sources_cluster', 'ic_sources', '(cluster_id)')
}

// ==================== ic_rows ====================

function ddlRows(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE ic_rows (
        id                varchar PRIMARY KEY,
        user_id           varchar,
        project_id        varchar NOT NULL,
        task_id           varchar NOT NULL,
        source_id         varchar,
        schema_id         varchar NOT NULL,
        requirement_id    varchar,
        row_json          text NOT NULL,
        value             double precision,
        unit              varchar,
        period            varchar,
        metric            varchar,
        dims_json         text,
        quote             text,
        confidence        varchar NOT NULL DEFAULT 'high',
        status            varchar NOT NULL DEFAULT 'draft',
        superseded_by     varchar,
        derived_from_json text,
        content_hash      varchar,
        needs_review      integer NOT NULL DEFAULT 0,
        created_at        timestamp,
        updated_at        timestamp
      )
    `
  }
  return `
    CREATE TABLE ic_rows (
      id                TEXT PRIMARY KEY,
      user_id           TEXT,
      project_id        TEXT NOT NULL,
      task_id           TEXT NOT NULL,
      source_id         TEXT,
      schema_id         TEXT NOT NULL,
      requirement_id    TEXT,
      row_json          TEXT NOT NULL,
      value             REAL,
      unit              TEXT,
      period            TEXT,
      metric            TEXT,
      dims_json         TEXT,
      quote             TEXT,
      confidence        TEXT NOT NULL DEFAULT 'high',
      status            TEXT NOT NULL DEFAULT 'draft',
      superseded_by     TEXT,
      derived_from_json TEXT,
      content_hash      TEXT,
      needs_review      INTEGER NOT NULL DEFAULT 0,
      created_at        DATETIME,
      updated_at        DATETIME
    )
  `
}

async function rowsIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_ic_rows_user', 'ic_rows', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_ic_rows_project_schema_status', 'ic_rows', '(project_id, schema_id, status)')
  await ensureIndex(ds, isPg, 'idx_ic_rows_source', 'ic_rows', '(source_id)')
  await ensureIndex(ds, isPg, 'idx_ic_rows_task', 'ic_rows', '(task_id)')
  await ensureIndex(ds, isPg, 'idx_ic_rows_hash', 'ic_rows', '(content_hash)')
}
