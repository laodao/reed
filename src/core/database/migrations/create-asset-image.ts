/**
 * 新建 asset_image 表（spec §3.8）+ 把现有 *_binding.image_paths JSON 数据搬过来。
 *
 * 数组每张图建一行：
 * - 首张：category='main', is_main=1, sort_order=0
 * - 其余：category='view', is_main=0, sort_order=index
 *
 * 兼容 SQLite + PG，幂等（用 (asset_type, asset_id) 联合判定已搬过的 binding 跳过）。
 */

import type { DataSource } from 'typeorm'
import { randomBytes } from 'crypto'

/** binding 表与 asset_type 枚举值的对应关系 */
const ASSET_TYPES: { tableName: string; assetType: 'character' | 'location' | 'item' }[] = [
  { tableName: 'character_bindings', assetType: 'character' },
  { tableName: 'location_bindings', assetType: 'location' },
  { tableName: 'item_bindings', assetType: 'item' },
]

/**
 * 建立 asset_image 表并把各 binding 表的 image_paths JSON 数组搬过来。
 *
 * @param ds TypeORM DataSource（SQLite 或 PostgreSQL）
 */
export async function createAssetImage(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  // 1. 建表（幂等）
  await ensureAssetImageTable(ds, isPg)

  // 1.1 兼容历史库：补 metadata 列（P3a task 2 引入；旧 schema 可能缺）
  await ensureMetadataColumn(ds, isPg)

  // 2. 搬运每个 binding 表的 image_paths
  for (const { tableName, assetType } of ASSET_TYPES) {
    const tableExists = await checkTableExists(ds, tableName, isPg)
    if (!tableExists) {
      console.log(`[create-asset-image] 表 ${tableName} 不存在，跳过`)
      continue
    }

    const hasImagePaths = await checkColumnExists(ds, tableName, 'image_paths', isPg)
    if (!hasImagePaths) {
      console.log(`[create-asset-image] 表 ${tableName} 缺少 image_paths 列，跳过`)
      continue
    }

    const rows = await ds.query(
      `SELECT id, image_paths FROM "${tableName}" WHERE image_paths IS NOT NULL`,
    )

    for (const row of rows) {
      let paths: string[]
      try {
        paths =
          typeof row.image_paths === 'string'
            ? JSON.parse(row.image_paths)
            : (row.image_paths ?? [])
      } catch {
        // image_paths 格式损坏，跳过该行
        continue
      }
      if (!Array.isArray(paths) || paths.length === 0) continue

      // 幂等：检查是否已有该 binding 的记录
      const ph1 = isPg ? '$1' : '?'
      const ph2 = isPg ? '$2' : '?'
      const existing = await ds.query(
        `SELECT count(*) as c FROM asset_image WHERE asset_type = ${ph1} AND asset_id = ${ph2}`,
        [assetType, row.id],
      )
      const count = isPg ? Number(existing[0].c) : existing[0].c
      if (count > 0) continue

      // 插入每张图
      for (let i = 0; i < paths.length; i++) {
        const id = `ai_${randomBytes(8).toString('hex')}`
        const category = i === 0 ? 'main' : 'view'
        const isMain = i === 0 ? 1 : 0
        const ph = (n: number) => (isPg ? `$${n}` : '?')
        await ds.query(
          `INSERT INTO asset_image
             (id, asset_type, asset_id, category, image_path, is_main, sort_order, created_at)
           VALUES
             (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)}, ${ph(7)}, ${isPg ? 'NOW()' : 'CURRENT_TIMESTAMP'})`,
          [id, assetType, row.id, category, paths[i], isMain, i],
        )
      }

      console.log(
        `[create-asset-image] ${assetType} ${row.id}: 搬运 ${paths.length} 张图`,
      )
    }
  }
}

// ─── 内部工具函数 ──────────────────────────────────────────────────────────────

/**
 * 建立 asset_image 表及索引，若已存在则跳过（幂等）。
 */
async function ensureAssetImageTable(ds: DataSource, isPg: boolean): Promise<void> {
  const tableExists = await checkTableExists(ds, 'asset_image', isPg)
  if (tableExists) return

  if (isPg) {
    await ds.query(`
      CREATE TABLE asset_image (
        id                    varchar        PRIMARY KEY,
        user_id               varchar,
        asset_type            varchar        NOT NULL,
        asset_id              varchar        NOT NULL,
        category              varchar        NOT NULL,
        label                 text,
        prompt                text,
        negative_prompt       text,
        image_path            text           NOT NULL,
        thumbnail_path        text,
        is_main               integer        NOT NULL DEFAULT 0,
        derived_from_image_id varchar,
        sort_order            integer        NOT NULL DEFAULT 0,
        metadata              text,
        created_at            timestamp      NOT NULL DEFAULT NOW(),
        updated_at            timestamp
      )
    `)
  } else {
    await ds.query(`
      CREATE TABLE asset_image (
        id                    TEXT        PRIMARY KEY,
        user_id               TEXT,
        asset_type            TEXT        NOT NULL,
        asset_id              TEXT        NOT NULL,
        category              TEXT        NOT NULL,
        label                 TEXT,
        prompt                TEXT,
        negative_prompt       TEXT,
        image_path            TEXT        NOT NULL,
        thumbnail_path        TEXT,
        is_main               INTEGER     NOT NULL DEFAULT 0,
        derived_from_image_id TEXT,
        sort_order            INTEGER     NOT NULL DEFAULT 0,
        metadata              TEXT,
        created_at            TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMP
      )
    `)
  }

  // 常用查询索引
  await ds.query(
    `CREATE INDEX idx_asset_image_asset ON asset_image (asset_type, asset_id)`,
  )
  await ds.query(
    `CREATE INDEX idx_asset_image_user_id ON asset_image (user_id)`,
  )

  console.log('[create-asset-image] asset_image 表及索引已建立')
}

/**
 * 老库可能在 P3a task 2 之前建过 asset_image 表（无 metadata 列），
 * 这里幂等地补列。
 */
async function ensureMetadataColumn(ds: DataSource, isPg: boolean): Promise<void> {
  const tableExists = await checkTableExists(ds, 'asset_image', isPg)
  if (!tableExists) return
  const hasMetadata = await checkColumnExists(ds, 'asset_image', 'metadata', isPg)
  if (hasMetadata) return
  if (isPg) {
    await ds.query(`ALTER TABLE asset_image ADD COLUMN metadata text`)
  } else {
    await ds.query(`ALTER TABLE asset_image ADD COLUMN metadata TEXT`)
  }
  console.log('[create-asset-image] 已补 metadata 列')
}

async function checkTableExists(
  ds: DataSource,
  table: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
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

async function checkColumnExists(
  ds: DataSource,
  table: string,
  column: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
      [table, column],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`,
    [table, column],
  )
  return rows.length > 0
}
