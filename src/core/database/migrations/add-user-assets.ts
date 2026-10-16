/**
 * user_assets 表（spec 2026-05-09 ep-redesign §3.2 D2 · P-7）
 *
 * 跨项目角色库：user_id × asset_type 二级 index；source_binding_id 反指原项目 binding。
 * 双库 PG/SQLite + 幂等。
 */

import type { DataSource } from 'typeorm'

export async function addUserAssets(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (await checkTableExists(ds, 'user_assets', isPg)) {
    console.log('[add-user-assets] user_assets 已存在，跳过')
    return
  }

  if (isPg) {
    await ds.query(`
      CREATE TABLE user_assets (
        id                VARCHAR PRIMARY KEY,
        user_id           VARCHAR,
        asset_type        VARCHAR NOT NULL,
        name              TEXT NOT NULL,
        description       TEXT,
        snapshot          TEXT NOT NULL,
        image_paths       TEXT,
        source_binding_id VARCHAR,
        created_at        BIGINT NOT NULL,
        updated_at        BIGINT NOT NULL
      )
    `)
  } else {
    await ds.query(`
      CREATE TABLE user_assets (
        id                TEXT PRIMARY KEY,
        user_id           TEXT,
        asset_type        TEXT NOT NULL,
        name              TEXT NOT NULL,
        description       TEXT,
        snapshot          TEXT NOT NULL,
        image_paths       TEXT,
        source_binding_id TEXT,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL
      )
    `)
  }

  await ds.query(`CREATE INDEX idx_user_assets_user_id ON user_assets(user_id)`)
  await ds.query(`CREATE INDEX idx_user_assets_user_type ON user_assets(user_id, asset_type)`)

  console.log('[add-user-assets] user_assets 表 + 2 索引创建完成')
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
