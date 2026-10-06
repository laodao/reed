/**
 * episode_scripts 增加 metadata 列（提示词优化方案 §4.5 保真校验可见性）。
 *
 * 用途：存放覆盖度报告 `coverageReport`（原文对白覆盖率 + 缺失清单 +
 * 正文↔dialogues 不一致条数），让"丢对白"从只打 console.warn 的事故
 * 变为剧集页可查的指标。
 *
 * 幂等。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function addEpisodeScriptMetadata(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'episode_scripts', isPg))) {
    console.log('[add-episode-script-metadata] episode_scripts 不存在，跳过')
    return
  }

  if (await checkColumnExists(ds, 'episode_scripts', 'metadata', isPg)) return

  await ds.query(`ALTER TABLE episode_scripts ADD COLUMN metadata TEXT`)
  console.log('[add-episode-script-metadata] 加列 metadata')
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
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
  const rows = await ds.query(`SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`, [
    table,
    column,
  ])
  return rows.length > 0
}