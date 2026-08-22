/**
 * 新建 assets 表（通用资产库）
 *
 * 用途：工作流「保存资产」节点与资产中心统一沉淀生成物（图片/音频/视频/文档/文本/JSON）。
 * 文件型资产只存"相对 dataPath 的路径"，大内容一律在磁盘 assets/ 目录，本表仅存元数据。
 *
 * 幂等。兼容 SQLite + PG（datetime/timestamp、varchar/TEXT）。
 */

import type { DataSource } from 'typeorm'

export async function createAssetsTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'

  if (!(await checkTableExists(ds, 'assets', isPg))) {
    await ds.query(`
      CREATE TABLE assets (
        id            ${vc} PRIMARY KEY,
        user_id       ${vc},
        category      ${vc} NOT NULL,
        name          ${vc} NOT NULL,
        description   ${vc},
        tags          ${vc},
        kind          ${vc} NOT NULL,
        storage_path  ${vc},
        url           ${vc},
        text_content  ${vc},
        json_content  ${vc},
        mime_type     ${vc},
        size_bytes    INTEGER,
        metadata      ${vc},
        source_type   ${vc},
        source_ref    ${vc},
        created_at    ${dt},
        updated_at    ${dt}
      )
    `)
    console.log('[create-assets-tables] 表 assets 创建完成')
  }

  await ds.query(`CREATE INDEX IF NOT EXISTS idx_assets_user ON assets (user_id)`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_assets_category ON assets (category)`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_assets_created ON assets (created_at)`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_assets_source ON assets (source_type, source_ref)`)
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
  return rows.length > 0
}
