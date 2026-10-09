/**
 * asset_versions 表（资产版本管理 · append-only）
 *
 * 版本链挂在文本型资产上：save-asset 节点带 version_of 时追加版本并就地更新资产内容；
 * 回滚 = 取历史版内容另存为新版本。双库 PG/SQLite + 幂等。
 * 列名/类型与 asset-version.entity.ts 严格一致（checkSchemaDrift 校验）。
 */

import type { DataSource } from 'typeorm'

export async function createAssetVersions(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (await checkTableExists(ds, 'asset_versions', isPg)) {
    console.log('[create-asset-versions] asset_versions 已存在，跳过')
    return
  }

  if (isPg) {
    await ds.query(`
      CREATE TABLE asset_versions (
        id         VARCHAR PRIMARY KEY,
        user_id    VARCHAR,
        asset_id   VARCHAR NOT NULL,
        version    INTEGER NOT NULL,
        content    TEXT NOT NULL,
        feedback   TEXT,
        created_by VARCHAR,
        created_at BIGINT NOT NULL
      )
    `)
  } else {
    await ds.query(`
      CREATE TABLE asset_versions (
        id         TEXT PRIMARY KEY,
        user_id    TEXT,
        asset_id   TEXT NOT NULL,
        version    INTEGER NOT NULL,
        content    TEXT NOT NULL,
        feedback   TEXT,
        created_by TEXT,
        created_at INTEGER NOT NULL
      )
    `)
  }

  await ds.query(`CREATE INDEX idx_asset_versions_asset ON asset_versions(asset_id)`)
  await ds.query(`CREATE INDEX idx_asset_versions_asset_version ON asset_versions(asset_id, version)`)

  console.log('[create-asset-versions] asset_versions 表 + 2 索引创建完成')
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const r = await ds.query(`SELECT to_regclass('public.${table}') AS t`)
    return Boolean(r[0]?.t)
  }
  const r = await ds.query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [table],
  )
  return r.length > 0
}
