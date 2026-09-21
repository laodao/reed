/**
 * location_bindings 增加 parent_id 字段（2026-09-21 地点层级）
 *
 * 同一场所的不同区域（"雪麓山庄闺房" → 父 "雪麓山庄"）通过 parent_id 挂到父级
 * 地点 binding 下；子区域主图生成时引用父级主图保建筑风格 / 材质 / 色调一致。
 * Nullable，默认 NULL（根地点）。
 */

import type { DataSource } from 'typeorm'

export async function addLocationParentId(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const table = 'location_bindings'

  if (!(await checkTableExists(ds, table, isPg))) {
    console.log(`[add-location-parent-id] ${table} 不存在，跳过`)
    return
  }
  if (await checkColumnExists(ds, table, 'parent_id', isPg)) return
  await ds.query(`ALTER TABLE ${table} ADD COLUMN parent_id TEXT`)
  console.log(`[add-location-parent-id] ${table}: 加列 parent_id`)
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

async function checkColumnExists(
  ds: DataSource,
  table: string,
  column: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
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
