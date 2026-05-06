/**
 * 给 storyboard_keyframe 表加 user_prompt_override 字段（spec §4.5.7 · FU5-A9-L4）。
 *
 * 用户在 ⑤ 关键帧 panel 输入的"调整方向"提示词需要持久化，否则下次重生成时丢失，
 * 用户得反复输入同样的内容。
 *
 * 兼容 SQLite + PG，幂等。
 */

import type { DataSource } from 'typeorm'

export async function addKeyframeUserPromptOverride(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  const tableExists = await checkTableExists(ds, 'storyboard_keyframe', isPg)
  if (!tableExists) {
    console.log('[add-keyframe-user-prompt-override] storyboard_keyframe 表不存在，跳过')
    return
  }

  const colExists = await checkColumnExists(
    ds,
    'storyboard_keyframe',
    'user_prompt_override',
    isPg,
  )
  if (colExists) return

  if (isPg) {
    await ds.query(
      `ALTER TABLE storyboard_keyframe ADD COLUMN user_prompt_override text`,
    )
  } else {
    await ds.query(
      `ALTER TABLE storyboard_keyframe ADD COLUMN user_prompt_override TEXT`,
    )
  }

  console.log('[add-keyframe-user-prompt-override] 已加列 user_prompt_override')
}

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
