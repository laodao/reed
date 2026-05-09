/**
 * 资产 binding 增加 reference_image_path 字段（spec 2026-05-09）
 *
 * 用户在 ② 资产 stage 设定卡上传一张参考图，作为 AI 生成该资产主图（main）时的参考输入。
 * 文件存盘在 user data 目录，DB 只存相对路径（与 image_assets.image_path 同一约定，
 * 兼容 web /assets 静态资源路径协议）。
 *
 * 三张表同时加列：character_bindings / location_bindings / item_bindings。
 * Nullable，默认 NULL（无参考图时主图按现有 prompt-only 流程生成）。
 */

import type { DataSource } from 'typeorm'

export async function addBindingReferenceImagePath(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  for (const table of ['character_bindings', 'location_bindings', 'item_bindings']) {
    if (!(await checkTableExists(ds, table, isPg))) {
      console.log(`[add-binding-reference-image-path] ${table} 不存在，跳过`)
      continue
    }
    if (await checkColumnExists(ds, table, 'reference_image_path', isPg)) continue
    await ds.query(`ALTER TABLE ${table} ADD COLUMN reference_image_path TEXT`)
    console.log(`[add-binding-reference-image-path] ${table}: 加列 reference_image_path`)
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
