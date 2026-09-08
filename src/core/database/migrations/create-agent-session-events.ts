/**
 * 会话原始流水表（agent_session_events，39 号 P0-2）
 *
 * append-only 的会话原始记录：每条 ModelMessage 首次进入历史时落一行，
 * 与 agent_sessions（全量替换的「当前工作集」）互补——压缩/剪枝/折叠改写
 * 工作集后原文仍可回放审计。
 *
 * 兼容 SQLite + PG，幂等。接入点：electron runMultiTenantMigrations /
 * web initDatabase（紧随 create-agent-tables 系列之后）。
 */

import type { DataSource } from 'typeorm'
import { ensureTable, ensureIndex } from './migration-utils'

/** 创建 agent_session_events（若不存在）。 */
export async function createAgentSessionEvents(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  await ensureTable(ds, isPg, 'agent_session_events', ddl(isPg), () => ensureIndexes(ds, isPg))
}

function ddl(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE agent_session_events (
        id              varchar PRIMARY KEY,
        user_id         varchar,
        conversation_id varchar NOT NULL,
        seq             integer NOT NULL,
        role            varchar NOT NULL,
        content         text NOT NULL,
        created_at      timestamp
      )
    `
  }
  return `
    CREATE TABLE agent_session_events (
      id              TEXT PRIMARY KEY,
      user_id         TEXT,
      conversation_id TEXT NOT NULL,
      seq             INTEGER NOT NULL,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      created_at      DATETIME
    )
  `
}

async function ensureIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_agent_events_conv', 'agent_session_events', '(conversation_id)')
}
