/**
 * storyboards 表增加 metadata 字段（spec 2026-05-09 ep-redesign §3.2 B5）
 *
 * 镜头语言层扩展：焦距 / 光圈 / 相机风格 / 打光预设 等。
 * 用 JSON 文本列存储（不强约束 schema，方便后续扩展）。
 *
 * Nullable，默认 NULL（老分镜读空时 metadata = null）。
 *
 * 双库：PostgreSQL + SQLite 都用 TEXT 列（simple-json 由 TypeORM serialize/deserialize）。
 */

import type { DataSource } from 'typeorm'

export async function addStoryboardMetadata(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'storyboards', isPg))) {
    console.log('[add-storyboard-metadata] storyboards 不存在，跳过')
    return
  }
  if (await checkColumnExists(ds, 'storyboards', 'metadata', isPg)) {
    console.log('[add-storyboard-metadata] metadata 已存在，跳过')
    return
  }
  await ds.query(`ALTER TABLE storyboards ADD COLUMN metadata TEXT`)
  console.log('[add-storyboard-metadata] storyboards: 加列 metadata')
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
    `SELECT 1 FROM pragma_table_info(?) WHERE name = ?`,
    [table, column],
  )
  return rows.length > 0
}
