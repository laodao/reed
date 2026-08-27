/**
 * 知识库目录表（kb_folders）+ knowledge_bases.folder_id 迁移
 *
 * 用途：把知识库按目录/分组组织（如 it 行业、能源行业）。
 * - kb_folders：目录（一级分组；parent_id 预留多级扩展，V1 不强制）
 * - knowledge_bases 增 folder_id 列（可空 = 未分类）
 *
 * 幂等。兼容 SQLite + PG（datetime/timestamp、varchar/TEXT）。
 */
import type { DataSource } from 'typeorm'

export async function createKbFolders(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'

  if (!(await checkTableExists(ds, 'kb_folders', isPg))) {
    await ds.query(`
      CREATE TABLE kb_folders (
        id          ${vc} PRIMARY KEY,
        user_id     ${vc},
        name        ${vc} NOT NULL,
        parent_id   ${vc},
        sort_order  INTEGER DEFAULT 0,
        created_at  ${dt},
        updated_at  ${dt}
      )
    `)
    console.log('[create-kb-folders] 表 kb_folders 创建完成')
  }

  await ds.query(`CREATE INDEX IF NOT EXISTS idx_kb_folders_user ON kb_folders (user_id)`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_kb_folders_parent ON kb_folders (parent_id)`)

  // knowledge_bases 加 folder_id（幂等补列；SQLite/PG 双端）
  if (!(await checkColumnExists(ds, 'knowledge_bases', 'folder_id', isPg))) {
    await ds.query(`ALTER TABLE knowledge_bases ADD COLUMN folder_id ${vc}`)
    console.log('[create-kb-folders] knowledge_bases 加列 folder_id')
  }
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_kb_folder ON knowledge_bases (folder_id)`)
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
  const rows = await ds.query(`SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`, [table, column])
  return rows.length > 0
}
