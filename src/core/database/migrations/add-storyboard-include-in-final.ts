/**
 * storyboards 增加 include_in_final 字段
 *
 * ⑥ 合成阶段：用户可在时间线上勾选/取消每个分镜是否进入最终成片。
 * 一个场景可能有多个分镜（不同角度 / 备选视角），不一定全部合成。
 *
 * 1=true（默认，含入），0=false（跳过）。SQLite + PG 兼容。幂等。
 */

import type { DataSource } from 'typeorm'

export async function addStoryboardIncludeInFinal(
  ds: DataSource,
): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'storyboards', isPg))) {
    console.log('[add-storyboard-include-in-final] storyboards 不存在，跳过')
    return
  }

  if (
    await checkColumnExists(ds, 'storyboards', 'include_in_final', isPg)
  ) return

  const type = isPg ? 'integer' : 'INTEGER'
  await ds.query(
    `ALTER TABLE storyboards ADD COLUMN include_in_final ${type} DEFAULT 1`,
  )
  console.log('[add-storyboard-include-in-final] 加列 include_in_final')
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
