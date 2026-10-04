/**
 * diary_attachments 增加 description 列（spec 2026-09-24 日记增强 P3-1）。
 *
 * 用途：贴图入库时由视觉模型生成的中文描述（best-effort，可为 NULL）。
 * 描述写进 markdown alt text 并作为附件的检索上下文——图片从"检索黑洞"变为可索引素材。
 *
 * 幂等。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function addDiaryAttachmentDescription(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'diary_attachments', isPg))) {
    console.log('[add-diary-attachment-description] diary_attachments 不存在，跳过')
    return
  }

  if (!(await checkColumnExists(ds, 'diary_attachments', 'description', isPg))) {
    await ds.query(`ALTER TABLE diary_attachments ADD COLUMN description TEXT`)
    console.log('[add-diary-attachment-description] 加列 description')
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
