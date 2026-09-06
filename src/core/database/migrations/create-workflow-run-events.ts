/**
 * 工作流引擎：新建 workflow_run_events（运行事件日志 / Run Journal，11 号 §4.1 E1）
 *
 * 用途：引擎私有强一致日志——每次调度状态变迁先落本表再改内存（先日志后内存
 * 不变量），进程崩溃/重启后按 (run_id, seq) 重放重建 RunExecution 继续执行。
 * 与通用事件平台（platform_events）分立：journal 在状态变迁关键路径上必须同步、
 * 有序、seq 严格单调，不复用异步投递语义（11 号 §3.1 三套事件边界）。
 *
 * 兼容 SQLite + PG，幂等。接入点：electron runMultiTenantMigrations / web initDatabase。
 */

import type { DataSource } from 'typeorm'
import { ensureTable, ensureIndex } from './migration-utils'

/** 创建 workflow_run_events（若不存在）。 */
export async function createWorkflowRunEvents(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  await ensureTable(ds, isPg, 'workflow_run_events', ddl(isPg), () =>
    ensureIndexes(ds, isPg)
  )
}

function ddl(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE workflow_run_events (
        id           varchar PRIMARY KEY,
        user_id      varchar,
        run_id       varchar NOT NULL,
        seq          integer NOT NULL,
        type         varchar NOT NULL,
        node_id      varchar,
        scope_key    varchar,
        payload_json text,
        created_at   timestamp
      )
    `
  }
  return `
    CREATE TABLE workflow_run_events (
      id           TEXT PRIMARY KEY,
      user_id      TEXT,
      run_id       TEXT NOT NULL,
      seq          INTEGER NOT NULL,
      type         TEXT NOT NULL,
      node_id      TEXT,
      scope_key    TEXT,
      payload_json TEXT,
      created_at   DATETIME
    )
  `
}

async function ensureIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_wf_runevent_user', 'workflow_run_events', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_wf_runevent_run', 'workflow_run_events', '(run_id)')
  // 重放序号唯一：同 run 内严格单调，写入竞态由 DB 兜底拒绝（11 号 §3.2 不变量 1）
  await ensureIndex(
    ds,
    isPg,
    'uq_wf_runevent_seq',
    'workflow_run_events',
    '(run_id, seq)',
    true
  )
}
