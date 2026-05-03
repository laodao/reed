/**
 * storyboards 加 background_ref_image_id 字段（spec §4.8）。
 *
 * 指向 asset_image.id（category='panorama_snapshot'），用于关联 360 全景截图
 * 作为分镜的背景 ref 图。
 *
 * 兼容 SQLite + PostgreSQL；幂等：表不存在 / 列已存在时静默跳过。
 */

import type { DataSource } from 'typeorm'

export async function addStoryboardBackgroundRef(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'storyboards', isPg))) {
    console.log('[add-storyboard-background-ref] storyboards 表不存在，跳过')
    return
  }
  if (await checkColumnExists(ds, 'storyboards', 'background_ref_image_id', isPg)) {
    return
  }

  const colType = isPg ? 'varchar' : 'TEXT'
  await ds.query(
    `ALTER TABLE "storyboards" ADD COLUMN background_ref_image_id ${colType}`,
  )
  console.log('[add-storyboard-background-ref] storyboards: 加列 background_ref_image_id')
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

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
