/**
 * 工具产物归档表（agent_tool_artifacts，39 号 P1-1）
 *
 * 完整工具结果按 toolCallId 落档：上下文内的截断（8K）/剪枝（[pruned…]）/
 * 折叠（[superseded…]）占位可经 get_tool_result 回查全文。只归档成功结果。
 *
 * 兼容 SQLite + PG，幂等。接入点：electron runMultiTenantMigrations /
 * web initDatabase（紧随 create-agent-tables 系列之后）。
 */

import type { DataSource } from 'typeorm'
import { ensureTable, ensureIndex } from './migration-utils'

/** 创建 agent_tool_artifacts（若不存在）。 */
export async function createAgentToolArtifacts(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  await ensureTable(ds, isPg, 'agent_tool_artifacts', ddl(isPg), () => ensureIndexes(ds, isPg))
}

function ddl(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE agent_tool_artifacts (
        id            varchar PRIMARY KEY,
        user_id       varchar,
        scope_key     varchar NOT NULL,
        tool_call_id  varchar NOT NULL,
        tool_name     varchar NOT NULL,
        payload_json  text NOT NULL,
        created_at    timestamp
      )
    `
  }
  return `
    CREATE TABLE agent_tool_artifacts (
      id            TEXT PRIMARY KEY,
      user_id       TEXT,
      scope_key     TEXT NOT NULL,
      tool_call_id  TEXT NOT NULL,
      tool_name     TEXT NOT NULL,
      payload_json  TEXT NOT NULL,
      created_at    DATETIME
    )
  `
}

async function ensureIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'uq_agent_artifacts_call', 'agent_tool_artifacts', '(tool_call_id)', true)
  await ensureIndex(ds, isPg, 'idx_agent_artifacts_scope', 'agent_tool_artifacts', '(scope_key)')
}
