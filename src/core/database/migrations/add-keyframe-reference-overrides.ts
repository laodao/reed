/**
 * storyboard_keyframe 增加 reference_overrides 字段
 *
 * 阶段 2 · 用户精细控制：每张关键帧允许用户为每个出场资产
 * （角色 / 地点 / 物品）指定具体的 asset_image 作为参考图，
 * 覆盖默认的 pickReferenceImage 自动评分逻辑。
 *
 * 列内容：JSON 数组，每项 { kind, bindingId, imageId }。
 * 兼容 SQLite + PG。幂等加列。
 */

import type { DataSource } from 'typeorm'

export async function addKeyframeReferenceOverrides(
  ds: DataSource,
): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'storyboard_keyframe', isPg))) {
    console.log(
      '[add-keyframe-reference-overrides] storyboard_keyframe 不存在，跳过',
    )
    return
  }

  if (
    await checkColumnExists(ds, 'storyboard_keyframe', 'reference_overrides', isPg)
  ) return

  const type = isPg ? 'text' : 'TEXT'
  await ds.query(
    `ALTER TABLE storyboard_keyframe ADD COLUMN reference_overrides ${type}`,
  )
  console.log('[add-keyframe-reference-overrides] 加列 reference_overrides')
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
