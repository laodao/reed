/**
 * location_bindings 加场景类型 + 规模 + 氛围 + 风格锚点字段（FU5-C3 / spec §3.2·§3.3）
 *
 * 兼容 SQLite + PG，幂等。
 */

import type { DataSource } from 'typeorm'

const COLS_TEXT = [
  'location_type', // interior / exterior / mixed / fantasy / etc
  'scale', // 小 / 中 / 大 / 巨大
  'mood_tags', // JSON 数组（氛围 tags）
  'style_anchors', // JSON 数组（风格锚点）
]

export async function addLocationBindingExtraFields(
  ds: DataSource,
): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  if (!(await checkTableExists(ds, 'location_bindings', isPg))) {
    console.log('[add-location-binding-extra] location_bindings 不存在，跳过')
    return
  }

  for (const col of COLS_TEXT) {
    if (await checkColumnExists(ds, 'location_bindings', col, isPg)) continue
    const type = isPg ? 'text' : 'TEXT'
    await ds.query(`ALTER TABLE location_bindings ADD COLUMN ${col} ${type}`)
    console.log(`[add-location-binding-extra] 加列 ${col}`)
  }
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
