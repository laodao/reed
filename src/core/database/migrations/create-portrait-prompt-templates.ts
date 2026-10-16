/**
 * 创建 portrait_prompt_templates（人像提示词模板）表。
 *
 * 新版人像设计（spec 2026-07-24）：提示词模板资产化，
 * 内置模板（来自 docs/prompt.txt）+ 用户自定义。
 *
 * 幂等建表。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function createPortraitPromptTemplates(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (await checkTableExists(ds, 'portrait_prompt_templates', isPg)) return

  if (isPg) {
    await ds.query(`
      CREATE TABLE portrait_prompt_templates (
        id text PRIMARY KEY,
        user_id text,
        name text NOT NULL,
        category text NOT NULL,
        content text NOT NULL,
        apply_to text,
        builtin boolean NOT NULL DEFAULT false,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `)
    await ds.query(
      `CREATE INDEX idx_portrait_prompt_templates_user ON portrait_prompt_templates (user_id)`,
    )
    await ds.query(
      `CREATE INDEX idx_portrait_prompt_templates_category ON portrait_prompt_templates (category)`,
    )
  } else {
    await ds.query(`
      CREATE TABLE portrait_prompt_templates (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        apply_to TEXT,
        builtin INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await ds.query(
      `CREATE INDEX idx_portrait_prompt_templates_user ON portrait_prompt_templates (user_id)`,
    )
    await ds.query(
      `CREATE INDEX idx_portrait_prompt_templates_category ON portrait_prompt_templates (category)`,
    )
  }
  console.log('[create-portrait-prompt-templates] 建表完成')
}

async function checkTableExists(
  ds: DataSource,
  table: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [table],
  )
  return rows.length > 0
}
