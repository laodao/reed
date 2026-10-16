/**
 * lw_projects 加 cover_path 字段（长文项目封面，2026-09-19）
 *
 * 用户可上传本地图片或从系统资产选图作为项目封面；封面用于项目卡展示，
 * 并作为导出 PDF/EPUB 的封面页。文件落盘 <dataPath>/longwriting/covers/<projectId>/，
 * DB 只存相对 dataPath 的路径（与 lw_project_maps.image_path 同一约定，
 * 兼容 web /assets 静态资源路径协议）。
 *
 * Nullable，默认 NULL（未设置封面时列表卡显示默认图标、导出无封面页）。
 * 必须在 Electron 端 schema 漂移检查之前执行，否则旧库会因缺列被判定漂移。
 */

import type { DataSource } from 'typeorm'

export async function addLwProjectCoverPath(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  const table = 'lw_projects'
  if (!(await checkTableExists(ds, table, isPg))) {
    console.log(`[add-lw-project-cover-path] ${table} 不存在，跳过`)
    return
  }
  if (await checkColumnExists(ds, table, 'cover_path', isPg)) return
  await ds.query(`ALTER TABLE ${table} ADD COLUMN cover_path TEXT`)
  console.log(`[add-lw-project-cover-path] ${table}: 加列 cover_path`)
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
