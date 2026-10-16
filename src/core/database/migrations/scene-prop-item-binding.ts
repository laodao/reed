/**
 * scene_props 加 item_binding_id 列 + 按 prop_name 匹配 item_bindings.item_name 自动回填。
 * 匹配不到的 prop_name 保留不动（item_binding_id 为 NULL）。
 *
 * 兼容 SQLite + PG，幂等。
 */

import type { DataSource } from 'typeorm'

/**
 * 确保 scene_props 表有 item_binding_id 列，并尝试按 prop_name = item_name 自动回填。
 *
 * @param ds TypeORM DataSource（SQLite 或 PostgreSQL）
 */
export async function ensureScenePropItemBinding(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  // scene_props 表不存在时直接跳过
  if (!(await checkTableExists(ds, 'scene_props', isPg))) return

  // 1. 加列（幂等：列已存在则跳过）
  if (!(await checkColumnExists(ds, 'scene_props', 'item_binding_id', isPg))) {
    const colType = isPg ? 'varchar' : 'TEXT'
    await ds.query(`ALTER TABLE scene_props ADD COLUMN item_binding_id ${colType}`)
    console.log('[scene-prop-item-binding] scene_props 加列：item_binding_id')
  }

  // 2. 数据回填（仅当 item_bindings 表存在）
  if (!(await checkTableExists(ds, 'item_bindings', isPg))) {
    console.log('[scene-prop-item-binding] item_bindings 表不存在，跳过回填')
    return
  }

  // 用 prop_name = item_name 匹配，仅回填 item_binding_id IS NULL 的行（幂等）
  if (isPg) {
    await ds.query(`
      UPDATE scene_props sp
      SET item_binding_id = ib.id
      FROM item_bindings ib
      WHERE sp.prop_name = ib.item_name
        AND sp.item_binding_id IS NULL
    `)
  } else {
    await ds.query(`
      UPDATE scene_props
      SET item_binding_id = (
        SELECT ib.id FROM item_bindings ib WHERE ib.item_name = scene_props.prop_name LIMIT 1
      )
      WHERE item_binding_id IS NULL
    `)
  }

  console.log('[scene-prop-item-binding] scene_props.item_binding_id 回填完成')
}

// ─── 内部工具函数 ──────────────────────────────────────────────────────────────

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
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
