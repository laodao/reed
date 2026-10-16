/**
 * agent 任务树表（agent_tasks，26 号 M3 批1 / 01 号 §5）
 *
 * 一行 = 一个任务节点（树：parent_id/root_id/depth）。子任务没有"完成"只有
 * "通过验收"（01 号 §6.1）——status=verifying 由质量门裁决。executor 决定
 * 执行载体：agent_loop（LoopRunner 直驱）| sub_workflow:<definitionId>（引擎
 * startRun）| human。root_id 冗余根节点便于树查询；depth 防递归爆炸。
 *
 * 兼容 SQLite + PG，幂等。接入点：electron runMultiTenantMigrations / web initDatabase。
 */

import type { DataSource } from 'typeorm'
import { ensureTable, ensureIndex } from './migration-utils'

/** 创建 agent_tasks（若不存在）。 */
export async function createAgentTasks(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  await ensureTable(ds, isPg, 'agent_tasks', ddl(isPg), () => ensureIndexes(ds, isPg))
}

function ddl(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE agent_tasks (
        id            varchar PRIMARY KEY,
        user_id       varchar,
        parent_id     varchar,
        root_id       varchar NOT NULL,
        depth         integer NOT NULL,
        title         varchar NOT NULL,
        spec_json     text NOT NULL,
        status        varchar NOT NULL,
        executor      varchar NOT NULL,
        run_id        varchar,
        budget_json   text,
        quality_score real,
        result_json   text,
        retry_count   integer DEFAULT 0,
        error         text,
        created_at    timestamp,
        updated_at    timestamp
      )
    `
  }
  return `
    CREATE TABLE agent_tasks (
      id            TEXT PRIMARY KEY,
      user_id       TEXT,
      parent_id     TEXT,
      root_id       TEXT NOT NULL,
      depth         INTEGER NOT NULL,
      title         TEXT NOT NULL,
      spec_json     TEXT NOT NULL,
      status        TEXT NOT NULL,
      executor      TEXT NOT NULL,
      run_id        TEXT,
      budget_json   TEXT,
      quality_score REAL,
      result_json   TEXT,
      retry_count   INTEGER DEFAULT 0,
      error         TEXT,
      created_at    DATETIME,
      updated_at    DATETIME
    )
  `
}

async function ensureIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_agent_task_user', 'agent_tasks', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_agent_task_root', 'agent_tasks', '(root_id)')
  await ensureIndex(ds, isPg, 'idx_agent_task_parent', 'agent_tasks', '(parent_id)')
  await ensureIndex(ds, isPg, 'idx_agent_task_status', 'agent_tasks', '(status)')
}
