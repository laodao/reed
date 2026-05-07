/**
 * item_bindings 加 style_anchors 列（spec 2026-05-08 风格预设与 character/location 对齐）
 *
 * 兼容 SQLite + PG。幂等。
 */

import type { DataSource } from 'typeorm'

export async function addItemBindingStyleAnchors(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'item_bindings', isPg))) {
    console.log('[add-item-binding-style-anchors] item_bindings 不存在，跳过')
    return
  }

  if (await checkColumnExists(ds, 'item_bindings', 'style_anchors', isPg)) {
    return
  }

  const type = isPg ? 'text' : 'TEXT'
  await ds.query(`ALTER TABLE item_bindings ADD COLUMN style_anchors ${type}`)
  console.log('[add-item-binding-style-anchors] 加列 style_anchors')
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
