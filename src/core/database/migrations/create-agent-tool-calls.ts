/**
 * agent 工具调用审计表（agent_tool_calls，25 号 M2 批1 / 14 号 §4.1 / 13 号）
 *
 * 用途：AgentToolRegistry 审计 sink 的落库形态——每次工具调用（含被拦截/被拒）
 * 一行，字段白名单制（禁记解密后凭据/完整响应体；args/result 只落 ≤500 字符
 * preview，截断已在 registry 审计面完成）。
 *
 * 兼容 SQLite + PG，幂等。接入点：electron runMultiTenantMigrations / web initDatabase。
 */

import type { DataSource } from 'typeorm'
import { ensureTable, ensureIndex } from './migration-utils'

/** 创建 agent_tool_calls（若不存在）。 */
export async function createAgentToolCalls(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  await ensureTable(ds, isPg, 'agent_tool_calls', ddl(isPg), () => ensureIndexes(ds, isPg))
}

function ddl(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE agent_tool_calls (
        id             varchar PRIMARY KEY,
        user_id        varchar,
        run_id         varchar,
        node_id        varchar,
        session_key    varchar,
        tool_name      varchar NOT NULL,
        danger_level   varchar NOT NULL,
        approval       varchar NOT NULL,
        status         varchar NOT NULL,
        error_code     varchar,
        args_preview   text,
        result_preview text,
        truncated      boolean DEFAULT FALSE,
        duration_ms    integer,
        context_json   text,
        created_at     timestamp
      )
    `
  }
  return `
    CREATE TABLE agent_tool_calls (
      id             TEXT PRIMARY KEY,
      user_id        TEXT,
      run_id         TEXT,
      node_id        TEXT,
      session_key    TEXT,
      tool_name      TEXT NOT NULL,
      danger_level   TEXT NOT NULL,
      approval       TEXT NOT NULL,
      status         TEXT NOT NULL,
      error_code     TEXT,
      args_preview   TEXT,
      result_preview TEXT,
      truncated      INTEGER DEFAULT 0,
      duration_ms    INTEGER,
      context_json   TEXT,
      created_at     DATETIME
    )
  `
}

async function ensureIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_agent_toolcall_user', 'agent_tool_calls', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_agent_toolcall_run', 'agent_tool_calls', '(run_id)')
  await ensureIndex(ds, isPg, 'idx_agent_toolcall_session', 'agent_tool_calls', '(session_key)')
}
