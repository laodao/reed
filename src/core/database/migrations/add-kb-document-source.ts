/**
 * kb_documents 增加 source_type / source_id 字段，加复合索引。
 *
 * 用途：跨模块导入（如日记）的去重 upsert——按 (knowledge_base_id, source_type, source_id)
 * 查找已存在的文档；命中则更新内容、清旧 chunks/vectors/inverted-index 后重新跑 processDocument。
 *
 * 用户手动上传的文档保持 source_type / source_id 为 NULL，行为不变。
 *
 * 幂等。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function addKbDocumentSource(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'kb_documents', isPg))) {
    console.log('[add-kb-document-source] kb_documents 不存在，跳过')
    return
  }

  // 与 entity 一致：用无 length 的 varchar（PG）/ TEXT（SQLite）。
  // 加 length 会让 SQLite 的 PRAGMA 报 VARCHAR(N)，与 entity 声明的 'varchar' 触发 schema-drift 误报。
  const varcharType = isPg ? 'varchar' : 'TEXT'

  if (!(await checkColumnExists(ds, 'kb_documents', 'source_type', isPg))) {
    await ds.query(`ALTER TABLE kb_documents ADD COLUMN source_type ${varcharType}`)
    console.log('[add-kb-document-source] 加列 source_type')
  }

  if (!(await checkColumnExists(ds, 'kb_documents', 'source_id', isPg))) {
    await ds.query(`ALTER TABLE kb_documents ADD COLUMN source_id ${varcharType}`)
    console.log('[add-kb-document-source] 加列 source_id')
  }

  if (!(await checkIndexExists(ds, 'idx_kb_documents_source', isPg))) {
    await ds.query(
      `CREATE INDEX idx_kb_documents_source ON kb_documents (knowledge_base_id, source_type, source_id)`,
    )
    console.log('[add-kb-document-source] 加索引 idx_kb_documents_source')
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

async function checkIndexExists(ds: DataSource, indexName: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1 AND schemaname = current_schema() LIMIT 1`,
      [indexName],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type='index' AND name = ? LIMIT 1`,
    [indexName],
  )
  return rows.length > 0
}
