/**
 * lw_token_usages 建表（W3.2 token 用量计量，2026-10-17）
 *
 * 每次 LLM 调用一行：用途/模型/上下文 token/耗时，供项目页用量汇总与配额打基础。
 * provider 未返回 usage 时记估算值（UTF-8 字节/4）并置 is_estimated=1。
 * 幂等（CREATE TABLE IF NOT EXISTS，双语种）。
 */

import type { DataSource } from 'typeorm'

export async function createLwTokenUsages(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (isPg) {
    await ds.query(`
      CREATE TABLE IF NOT EXISTS lw_token_usages (
        id VARCHAR PRIMARY KEY,
        user_id VARCHAR,
        project_id VARCHAR NOT NULL,
        chapter_id VARCHAR,
        purpose VARCHAR NOT NULL,
        provider_config_id VARCHAR,
        model_id VARCHAR,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        is_estimated INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        created_at BIGINT
      )
    `)
    await ds.query(`CREATE INDEX IF NOT EXISTS idx_lw_token_usages_project ON lw_token_usages (project_id)`)
    await ds.query(`CREATE INDEX IF NOT EXISTS idx_lw_token_usages_chapter ON lw_token_usages (project_id, chapter_id)`)
    await ds.query(`CREATE INDEX IF NOT EXISTS idx_lw_token_usages_user ON lw_token_usages (user_id)`)
  } else {
    await ds.query(`
      CREATE TABLE IF NOT EXISTS lw_token_usages (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        project_id TEXT NOT NULL,
        chapter_id TEXT,
        purpose TEXT NOT NULL,
        provider_config_id TEXT,
        model_id TEXT,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        is_estimated INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        created_at INTEGER
      )
    `)
    await ds.query(`CREATE INDEX IF NOT EXISTS idx_lw_token_usages_project ON lw_token_usages (project_id)`)
    await ds.query(`CREATE INDEX IF NOT EXISTS idx_lw_token_usages_chapter ON lw_token_usages (project_id, chapter_id)`)
    await ds.query(`CREATE INDEX IF NOT EXISTS idx_lw_token_usages_user ON lw_token_usages (user_id)`)
  }
  console.log('[create-lw-token-usages] lw_token_usages 就绪')
}
