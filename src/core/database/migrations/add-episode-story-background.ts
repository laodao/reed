/**
 * video_episodes 加故事背景三列（spec 2026-05-08）
 *
 * 字段：story_era / story_region / story_background_extra
 * 用途：① 内容页面"故事背景卡"持久化；主图 prompt 拼接锚点。
 *
 * 兼容 SQLite + PG。幂等。
 */

import type { DataSource } from 'typeorm'

const COLS = ['story_era', 'story_region', 'story_background_extra']

export async function addEpisodeStoryBackground(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'video_episodes', isPg))) {
    console.log('[add-episode-story-background] video_episodes 不存在，跳过')
    return
  }

  for (const col of COLS) {
    if (await checkColumnExists(ds, 'video_episodes', col, isPg)) continue
    const type = isPg ? 'text' : 'TEXT'
    await ds.query(`ALTER TABLE video_episodes ADD COLUMN ${col} ${type}`)
    console.log(`[add-episode-story-background] 加列 ${col}`)
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
