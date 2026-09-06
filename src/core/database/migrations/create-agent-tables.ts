/**
 * Agent 公共运行时：新建 agent_sessions / agent_memories 两表
 *
 * 用途（tasks/2026-08-28-agent-loop-harness/23-interface-contracts.md §6）：
 * - agent_sessions —— 独立宿主（agent-loop 会话）的 ModelMessage 持久化落点。
 *   一行一条消息（content 存整体 JSON），save() 全量替换（事务内 DELETE+INSERT）。
 *   conversationId 约定 `{definitionId}:{scopeId}`。
 * - agent_memories —— 项目级长期记忆（15 号 MemoryService；本迁移先建表，
 *   实体与仓储随记忆批次接入）。(user_id, scope_id, canonical_key) 在
 *   status='active' 上部分唯一——同名事实只允许一条 active（对齐 uq_wf_run_mutex 先例）。
 *
 * 兼容 SQLite + PG，幂等（表/索引已存在则跳过）。
 * 列类型与 Entity 声明的 affinity 族一致（schema-drift 检查按族比对）：
 * datetime ↔ DATETIME/TIMESTAMP、text ↔ TEXT、integer ↔ INTEGER、varchar ↔ TEXT/varchar。
 *
 * 接入点（新增表后必查）：
 * - Electron：src/electron/database/index.ts runMultiTenantMigrations() 追加调用
 *   （drift 检查之前执行，见 initTypeOrmDataSource 内顺序）
 * - Web：src/web/server/index.ts initDatabase() 追加调用（synchronize 建表后补索引）
 */

import type { DataSource } from 'typeorm'
import { ensureTable, ensureIndex, ensurePartialUniqueIndex } from './migration-utils'


/**
 * 创建 agent 两表（若不存在）。
 * @param ds TypeORM DataSource（SQLite 或 PostgreSQL）
 */
export async function createAgentTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  await ensureTable(ds, isPg, 'agent_sessions', ddlSessions(isPg), () =>
    ensureSessionIndexes(ds, isPg)
  )
  await ensureTable(ds, isPg, 'agent_memories', ddlMemories(isPg), () =>
    ensureMemoryIndexes(ds, isPg)
  )
}

// ─── 表 DDL ────────────────────────────────────────────────────────────────

function ddlSessions(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE agent_sessions (
        id              varchar PRIMARY KEY,
        user_id         varchar,
        conversation_id varchar NOT NULL,
        seq             integer NOT NULL,
        role            varchar NOT NULL,
        content         text NOT NULL,
        metadata        text,
        created_at      timestamp
      )
    `
  }
  return `
    CREATE TABLE agent_sessions (
      id              TEXT PRIMARY KEY,
      user_id         TEXT,
      conversation_id TEXT NOT NULL,
      seq             INTEGER NOT NULL,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      metadata        TEXT,
      created_at      DATETIME
    )
  `
}

function ddlMemories(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE agent_memories (
        id              varchar PRIMARY KEY,
        user_id         varchar,
        scope_id        varchar NOT NULL,
        kind            varchar NOT NULL,
        status          varchar NOT NULL,
        canonical_key   varchar,
        title           text,
        content         text NOT NULL,
        source          text,
        superseded_by   varchar,
        idempotency_key varchar,
        created_at      timestamp,
        updated_at      timestamp
      )
    `
  }
  return `
    CREATE TABLE agent_memories (
      id              TEXT PRIMARY KEY,
      user_id         TEXT,
      scope_id        TEXT NOT NULL,
      kind            TEXT NOT NULL,
      status          TEXT NOT NULL,
      canonical_key   TEXT,
      title           TEXT,
      content         TEXT NOT NULL,
      source          TEXT,
      superseded_by   TEXT,
      idempotency_key TEXT,
      created_at      DATETIME,
      updated_at      DATETIME
    )
  `
}

// ─── 索引（与 Entity 装饰器命名一致；agent_memories 实体随记忆批次补齐） ──────

async function ensureSessionIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_agent_sessions_user', 'agent_sessions', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_agent_sessions_conversation', 'agent_sessions', '(conversation_id)')
  await ensureIndex(
    ds,
    isPg,
    'uq_agent_sessions_conv_seq',
    'agent_sessions',
    '(user_id, conversation_id, seq)',
    true
  )
}

async function ensureMemoryIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_agent_memories_user', 'agent_memories', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_agent_memories_scope', 'agent_memories', '(scope_id)')
  await ensureIndex(ds, isPg, 'idx_agent_memories_status', 'agent_memories', '(status)')
  // 幂等键唯一（可空：NULL ≠ NULL，两方言均不冲突——无幂等键的候选不参与约束）
  await ensureIndex(
    ds,
    isPg,
    'uq_agent_memories_idem',
    'agent_memories',
    '(idempotency_key)',
    true
  )
  // 同名事实唯一 active：partial unique（canonical_key 为 NULL 的行不参与——
  // 无规范化键的记忆不受"同名唯一"约束）。user_id 为 NULL 的行互不冲突
  // （两方言默认 NULL ≠ NULL，桌面单用户场景由应用层串行化兜底，同 uq_wf_run_mutex 先例）。
  await ensurePartialUniqueIndex(
    ds,
    isPg,
    'uq_agent_memories_canonical',
    'agent_memories',
    '(user_id, scope_id, canonical_key)',
    `status = 'active' AND canonical_key IS NOT NULL`,
    '同名事实部分唯一索引创建失败'
  )
}
