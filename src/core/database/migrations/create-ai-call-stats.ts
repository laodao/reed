/**
 * AI 调用用量落库（tasks/2026-09-16-ep-studio-polish S-09）：
 * 建 ai_call_stats 表——services/ai-call.ts 的 text/vlm/stream 调用完成/失败打点处
 * 异步 insert（fail-soft，绝不阻塞调用），Studio「用量」弹窗按 call_type+model 聚合。
 *
 * 可空字段允许 null（provider_config_id / model_id / duration_ms / project_id）。
 * 兼容 SQLite + PG，幂等。登记点：Electron runMultiTenantMigrations + Web initDatabase。
 */

import type { DataSource } from 'typeorm'
import { ensureTable, ensureIndex } from './migration-utils'

export async function createAiCallStats(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  const ddl = isPg
    ? `
      CREATE TABLE ai_call_stats (
        id                 varchar   PRIMARY KEY,
        call_type          varchar   NOT NULL,
        provider_config_id varchar,
        model_id           varchar,
        duration_ms        integer,
        project_id         varchar,
        created_at         timestamp NOT NULL DEFAULT NOW()
      )
    `
    : `
      CREATE TABLE ai_call_stats (
        id                 TEXT      PRIMARY KEY,
        call_type          TEXT      NOT NULL,
        provider_config_id TEXT,
        model_id           TEXT,
        duration_ms        INTEGER,
        project_id         TEXT,
        created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `

  await ensureTable(ds, isPg, 'ai_call_stats', ddl, async () => {
    await ensureIndex(ds, isPg, 'idx_acs_project', 'ai_call_stats', '(project_id, created_at)')
    await ensureIndex(ds, isPg, 'idx_acs_call_type', 'ai_call_stats', '(call_type)')
  }, 'create-ai-call-stats')
}
