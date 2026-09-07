/**
 * agent 轨迹表（agent_trajectories，25 号 M2 批1 / 01 号 §3.2）
 *
 * 用途：agent 循环逐轮轨迹（decision / tool_call / tool_result / human_request /
 * human_decision / guardrail_stop / final）落库，支撑运行详情页轨迹视图复盘与
 * token 观测。观测面数据（非引擎正确性依赖）：写入为幂等 insert-or-ignore，
 * 崩溃至多丢最后一步，不参与 journal 重放。
 *
 * 兼容 SQLite + PG，幂等。接入点：electron runMultiTenantMigrations / web initDatabase。
 */

import type { DataSource } from 'typeorm'
import { ensureTable, ensureIndex } from './migration-utils'

/** 创建 agent_trajectories（若不存在）。 */
export async function createAgentTrajectories(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  await ensureTable(ds, isPg, 'agent_trajectories', ddl(isPg), () => ensureIndexes(ds, isPg))
}

function ddl(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE agent_trajectories (
        id                varchar PRIMARY KEY,
        user_id           varchar,
        scope             varchar NOT NULL,
        scope_key         varchar NOT NULL,
        seq               integer NOT NULL,
        iteration         integer NOT NULL,
        kind              varchar NOT NULL,
        name              varchar,
        payload_json      text,
        prompt_tokens     integer,
        completion_tokens integer,
        duration_ms       integer,
        created_at        timestamp
      )
    `
  }
  return `
    CREATE TABLE agent_trajectories (
      id                TEXT PRIMARY KEY,
      user_id           TEXT,
      scope             TEXT NOT NULL,
      scope_key         TEXT NOT NULL,
      seq               INTEGER NOT NULL,
      iteration         INTEGER NOT NULL,
      kind              TEXT NOT NULL,
      name              TEXT,
      payload_json      TEXT,
      prompt_tokens     INTEGER,
      completion_tokens INTEGER,
      duration_ms       INTEGER,
      created_at        DATETIME
    )
  `
}

async function ensureIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_agent_traj_user', 'agent_trajectories', '(user_id)')
  // 幂等主键的业务序：同 scope_key 内 seq 单调（崩溃恢复重放不重不漏）
  await ensureIndex(ds, isPg, 'uq_agent_traj_seq', 'agent_trajectories', '(scope_key, seq)', true)
}
