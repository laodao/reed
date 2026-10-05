/**
 * diary_folders 增加 brain_opt_in 列（spec 2026-09-24 日记增强 P2-1）。
 *
 * 红线落地：日记消化默认关闭、按目录显式 opt-in（隐私先于融合）。
 * 开启后该目录条目自动注册为「日记」知识库文档（幂等 upsert），
 * 走既有消化管线产出 human 论断 → 提议箱人批。
 *
 * 幂等。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function addDiaryFolderBrainOptIn(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'diary_folders', isPg))) {
    console.log('[add-diary-folder-brain-opt-in] diary_folders 不存在，跳过')
    return
  }

  if (!(await checkColumnExists(ds, 'diary_folders', 'brain_opt_in', isPg))) {
    await ds.query(`ALTER TABLE diary_folders ADD COLUMN brain_opt_in ${isPg ? 'BOOLEAN DEFAULT FALSE' : 'INTEGER DEFAULT 0'}`)
    console.log('[add-diary-folder-brain-opt-in] 加列 brain_opt_in')
  }
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
  const rows = await ds.query(
    `SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`,
    [table, column],
  )
  return rows.length > 0
}
