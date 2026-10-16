/**
 * diary_entries 增加 deleted_at 软删除列（spec 2026-09-24 日记增强 P0-1）。
 *
 * 背景：原 deleteEntry 是物理 rm -rf + DB 级联，误删不可恢复。
 * 改为软删除后：删除=置 deleted_at（文件保留原位），回收站可恢复，
 * 30 天后由 DiaryService.purgeExpired 物理清理。
 *
 * 幂等。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function addDiaryDeletedAt(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'diary_entries', isPg))) {
    console.log('[add-diary-deleted-at] diary_entries 不存在，跳过')
    return
  }

  if (!(await checkColumnExists(ds, 'diary_entries', 'deleted_at', isPg))) {
    const tsType = isPg ? 'TIMESTAMP' : 'DATETIME'
    await ds.query(`ALTER TABLE diary_entries ADD COLUMN deleted_at ${tsType}`)
    console.log('[add-diary-deleted-at] 加列 deleted_at')
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
