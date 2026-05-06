/**
 * storyboards 增加 keyframe_count 字段
 *
 * 原型 §7.D-5 P0：分镜编辑面板里有"关键帧数 1-9"按钮组，前端持有
 * editDraft.keyframeCount 但保存链路上 UpdateStoryboardRequest 一直没该字段、
 * entity 也没列 → 修改保存"看似成功实际丢失"。
 *
 * 幂等加列。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function addStoryboardKeyframeCount(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'storyboards', isPg))) {
    console.log('[add-storyboard-keyframe-count] storyboards 不存在，跳过')
    return
  }

  if (await checkColumnExists(ds, 'storyboards', 'keyframe_count', isPg)) return

  const type = isPg ? 'integer' : 'INTEGER'
  await ds.query(
    `ALTER TABLE storyboards ADD COLUMN keyframe_count ${type}`,
  )
  console.log('[add-storyboard-keyframe-count] 加列 keyframe_count')
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
