/**
 * 步骤0：新建 lw_vector_indices 表（向量索引记录）
 *
 * 用途：记录长文写作模块"哪些实体/章节切片已入向量库"。
 * 向量本体在 IVectorStore（LanceDB vectors / PG kb_vectors），本表只存
 * chunkId ↔ 实体映射 + contentHash（增量更新）+ preview（命中片段预览）。
 *
 * 兼容 SQLite + PG，幂等（表/索引已存在则跳过）。
 *
 * 注意：TypeORM 的 entities 自动收集 + sqlite 测试库用 synchronize:true 会自动建此表，
 *       本 migration 主要服务生产环境（PC raw DDL + PG），保证表存在。
 */

import type { DataSource } from 'typeorm'

/**
 * 建 lw_vector_indices 表（若不存在）。
 * @param ds TypeORM DataSource（SQLite 或 PostgreSQL）
 */
export async function createLwVectorIndices(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  const exists = await checkTableExists(ds, 'lw_vector_indices', isPg)
  if (exists) {
    // 表已存在 → 确保索引也存在（补齐旧库）
    await ensureIndexes(ds, isPg)
    return
  }

  if (isPg) {
    await ds.query(`
      CREATE TABLE lw_vector_indices (
        id             varchar PRIMARY KEY,
        user_id        varchar,
        project_id     varchar NOT NULL,
        entity_type    text NOT NULL,
        entity_id      varchar NOT NULL,
        chapter_number integer,
        chunk_id       varchar NOT NULL,
        content_hash   text,
        preview        text,
        created_at     bigint,
        updated_at     bigint
      )
    `)
  } else {
    await ds.query(`
      CREATE TABLE lw_vector_indices (
        id             TEXT PRIMARY KEY,
        user_id        TEXT,
        project_id     TEXT NOT NULL,
        entity_type    TEXT NOT NULL,
        entity_id      TEXT NOT NULL,
        chapter_number INTEGER,
        chunk_id       TEXT NOT NULL,
        content_hash   TEXT,
        preview        TEXT,
        created_at     INTEGER,
        updated_at     INTEGER
      )
    `)
  }

  await ensureIndexes(ds, isPg)
  console.log('[create-lw-vector-indices] 表 lw_vector_indices 创建完成')
}

async function ensureIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_lw_vector_project', 'lw_vector_indices', '(project_id)')
  await ensureIndex(ds, isPg, 'idx_lw_vector_user', 'lw_vector_indices', '(user_id)')
  await ensureIndex(
    ds,
    isPg,
    'idx_lw_vector_entity',
    'lw_vector_indices',
    '(project_id, entity_type, entity_id)',
  )
  // UNIQUE 索引（chunk_id 唯一）—— 用 CREATE UNIQUE INDEX，避免依赖 entity 的 @Unique 装饰器
  await ensureIndex(ds, isPg, 'uq_lw_vector_chunk', 'lw_vector_indices', '(chunk_id)', true)
}

// ─── 内部工具（与项目其他 migration 同风格） ─────────────────────────────────

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

async function checkIndexExists(
  ds: DataSource,
  indexName: string,
  isPg: boolean,
): Promise<boolean> {
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

async function ensureIndex(
  ds: DataSource,
  isPg: boolean,
  indexName: string,
  table: string,
  columns: string,
  unique = false,
): Promise<void> {
  if (await checkIndexExists(ds, indexName, isPg)) return
  const uniqueKw = unique ? 'UNIQUE ' : ''
  try {
    await ds.query(
      `CREATE ${uniqueKw}INDEX ${indexName} ON ${table} ${columns}`,
    )
  } catch (e: any) {
    // 索引可能已由 entity synchronize 建过（如 sqlite 测试库），忽略冲突
    if (!/already exists|duplicate/i.test(e.message)) throw e
  }
}
