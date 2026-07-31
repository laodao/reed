/**
 * 步骤0：给 kb_vectors 表加长文向量元数据列（仅 PG 端）
 *
 * PgVectorStore 把所有向量（KB + 长文）都存在 kb_vectors 表（halfvec(8192)）。
 * 长文向量需要 4 个元数据列来支持 searchByMetadata 过滤：
 *   project_id / entity_type / entity_id / chapter_number
 *
 * 旧 KB 数据这些列为 NULL → 长文检索 projectId 非空天然隔离。
 *
 * SQLite 端不走此 migration（LanceDB 自己管理 vectors 表 schema，见 LanceDBService.ensureVectorSchema）。
 * 本函数在 sqlite 上是 no-op（直接返回），保证调用方无需判断 dialect。
 */

import type { DataSource } from 'typeorm'

/** kb_vectors 新增的元数据列 */
const METADATA_COLUMNS = [
  { name: 'project_id', pgType: 'TEXT' },
  { name: 'entity_type', pgType: 'TEXT' },
  { name: 'entity_id', pgType: 'TEXT' },
  { name: 'chapter_number', pgType: 'INTEGER' },
] as const

/**
 * 给 kb_vectors 加长文元数据列 + 索引（PG 端，幂等）。
 * sqlite 上 no-op。
 */
export async function extendKbVectorsMetadata(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  if (!isPg) return // sqlite 走 LanceDB schema 迁移

  // 1. 加列（每列幂等 ADD COLUMN IF NOT EXISTS）
  for (const col of METADATA_COLUMNS) {
    if (!(await checkColumnExists(ds, 'kb_vectors', col.name, true))) {
      await ds.query(
        `ALTER TABLE kb_vectors ADD COLUMN ${col.name} ${col.pgType}`,
      )
    }
  }

  // 2. 加索引（长文检索按 projectId / entity 过滤，HNSW 已在 embedding 列）
  await ensureIndex(ds, 'idx_kb_vectors_project', 'kb_vectors', '(project_id)')
  await ensureIndex(
    ds,
    'idx_kb_vectors_entity',
    'kb_vectors',
    '(project_id, entity_type, entity_id)',
  )

  console.log('[extend-kb-vectors-metadata] kb_vectors 元数据列已就绪')
}

// ─── 内部工具 ─────────────────────────────────────────────────────────────────

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

async function ensureIndex(
  ds: DataSource,
  indexName: string,
  table: string,
  columns: string,
): Promise<void> {
  const rows = await ds.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = $1 AND schemaname = current_schema() LIMIT 1`,
    [indexName],
  )
  if (rows.length > 0) return
  await ds.query(`CREATE INDEX ${indexName} ON ${table} ${columns}`)
}
