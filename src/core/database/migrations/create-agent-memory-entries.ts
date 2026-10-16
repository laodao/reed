/**
 * agent 知识飞轮条目表（agent_memory_entries，26 号 M3 批1 / 01 号 §4.3）
 *
 * 一行 = 一条跨任务沉淀的记忆（fact/sop/preference/skill/episode-ref）。
 * 闸门纪律（宁可慢不可脏）：distiller 产出一律 pending_review，人工批准才 active；
 * canonicalKey/关键词查重防污染。embedding_id 为 LanceDB 向量层复用位
 * （01 号 §4.4；M3 最小闭环用关键词检索，向量接线后置）。
 *
 * 兼容 SQLite + PG，幂等。接入点：electron runMultiTenantMigrations / web initDatabase。
 */

import type { DataSource } from 'typeorm'
import { ensureTable, ensureIndex } from './migration-utils'

/** 创建 agent_memory_entries（若不存在）。 */
export async function createAgentMemoryEntries(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  await ensureTable(ds, isPg, 'agent_memory_entries', ddl(isPg), () => ensureIndexes(ds, isPg))
}

function ddl(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE agent_memory_entries (
        id             varchar PRIMARY KEY,
        user_id        varchar,
        kind           varchar NOT NULL,
        content_json   text NOT NULL,
        embedding_id   varchar,
        source_run_id  varchar,
        source_task_id varchar,
        confidence     real DEFAULT 0,
        status         varchar NOT NULL,
        use_count      integer DEFAULT 0,
        success_count  integer DEFAULT 0,
        supersedes_id  varchar,
        created_at     timestamp,
        updated_at     timestamp
      )
    `
  }
  return `
    CREATE TABLE agent_memory_entries (
      id             TEXT PRIMARY KEY,
      user_id        TEXT,
      kind           TEXT NOT NULL,
      content_json   TEXT NOT NULL,
      embedding_id   TEXT,
      source_run_id  TEXT,
      source_task_id TEXT,
      confidence     REAL DEFAULT 0,
      status         TEXT NOT NULL,
      use_count      INTEGER DEFAULT 0,
      success_count  INTEGER DEFAULT 0,
      supersedes_id  TEXT,
      created_at     DATETIME,
      updated_at     DATETIME
    )
  `
}

async function ensureIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_agent_memory_user', 'agent_memory_entries', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_agent_memory_status', 'agent_memory_entries', '(status)')
  await ensureIndex(ds, isPg, 'idx_agent_memory_kind', 'agent_memory_entries', '(kind)')
}
