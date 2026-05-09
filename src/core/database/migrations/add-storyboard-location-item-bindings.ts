/**
 * storyboards 增加 location_binding_ids + item_binding_ids 字段（spec 2026-05-09）
 *
 * 用户在 ④ 分镜界面"镜头内角色"下方手动添加该分镜要出现的地点 / 物品 binding。
 * 形态：JSON 数组字符串（等价于 simple-json）— 例如 `["lc_xxx","lc_yyy"]`、`["it_zzz"]`。
 *
 * 与既有数据回退关系：
 *   - 分镜级 location_binding_ids 非空 → 覆盖 scene.location_binding_id（仅本分镜）
 *   - 分镜级 item_binding_ids 非空 → 覆盖 scene.characters[*].props 推导的 items
 *   - 留空 / NULL → 按现有 scene-level 推导（保持向后兼容）
 *
 * SQLite + PG 都用 TEXT。
 */

import type { DataSource } from 'typeorm'

export async function addStoryboardLocationItemBindings(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'storyboards', isPg))) {
    console.log('[add-storyboard-location-item-bindings] storyboards 不存在，跳过')
    return
  }

  if (!(await checkColumnExists(ds, 'storyboards', 'location_binding_ids', isPg))) {
    await ds.query(`ALTER TABLE storyboards ADD COLUMN location_binding_ids TEXT`)
    console.log('[add-storyboard-location-item-bindings] 加列 location_binding_ids')
  }

  if (!(await checkColumnExists(ds, 'storyboards', 'item_binding_ids', isPg))) {
    await ds.query(`ALTER TABLE storyboards ADD COLUMN item_binding_ids TEXT`)
    console.log('[add-storyboard-location-item-bindings] 加列 item_binding_ids')
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
