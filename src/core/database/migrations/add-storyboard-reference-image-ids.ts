/**
 * storyboards 增加 reference_image_ids 字段
 *
 * 用户在 ⑤ 制作 stage "本分镜引用的资产"卡片里点资产 → 弹出图库 → 选定一张图，
 * 这张图作为该分镜生成视频时的资产参考依据（覆盖默认的"按评分自动选图"）。
 *
 * 数据形态：JSON 文本，shape =
 *   { [`${kind}:${bindingId}`]: imageId }
 * 例：
 *   { "character:ch_xxx": "img_a", "location:loc_yyy": "img_b" }
 *
 * SQLite 用 TEXT；PG 同样 TEXT（应用层自行 JSON.parse / stringify，与 frame_image / characters 等
 * 既有 simple-json 字段保持一致）。Nullable，默认 NULL（无覆盖时按现有评分逻辑自动选图）。
 */

import type { DataSource } from 'typeorm'

export async function addStoryboardReferenceImageIds(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'storyboards', isPg))) {
    console.log('[add-storyboard-reference-image-ids] storyboards 不存在，跳过')
    return
  }

  if (await checkColumnExists(ds, 'storyboards', 'reference_image_ids', isPg)) return

  await ds.query(`ALTER TABLE storyboards ADD COLUMN reference_image_ids TEXT`)
  console.log('[add-storyboard-reference-image-ids] 加列 reference_image_ids')
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
