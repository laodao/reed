/**
 * 修复 kb_inverted_index 外键与统一知识池的冲突
 *
 * 背景（真机实证）：存量建表 DDL 带 FOREIGN KEY (chunk_id) REFERENCES kb_chunks，
 * 而统一检索池设计（T09）要求倒排索引容纳伪 chunkId（atom:/qa:/note: 命名空间）——
 * 论断入池每次写倒排都被 FK 拒绝（凡人修仙传/完美世界真机失败根因：
 * SqliteError: FOREIGN KEY constraint failed）。测试库手工 DDL 无 FK 故测试全绿，
 * 真机才炸——schema 双源漂移的又一案例。
 *
 * 处置：统一池的伪 ID 是设计使然，FK 是切片时代的过期约束——重建表去掉两条 FK
 * （列与索引保持不变）。幂等；兼容 SQLite（rebuild）+ PG（DROP CONSTRAINT）。
 *
 * 注册点（双入口，防漏单端——PR checklist 必查）：
 * - Electron: src/electron/database/index.ts runMultiTenantMigrations
 * - Web:      src/web/server/index.ts（与 create-kb-brain-tables 同层）
 */
import type { DataSource } from 'typeorm'

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  const sql = isPg
    ? `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = '${table}' AND table_schema = current_schema()`
    : `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='${table}'`
  const rows = (await ds.query(sql)) as Array<{ count: number }>
  return Number(rows[0]?.count ?? 0) > 0
}

export async function fixKbInvertedIndexFk(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  if (!(await checkTableExists(ds, 'kb_inverted_index', isPg))) return

  if (isPg) {
    // PG：直接删约束（按信息架构找，不存在则跳过）
    const rows = (await ds.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'kb_inverted_index'::regclass AND contype = 'f'
    `)) as Array<{ conname: string }>
    for (const r of rows) {
      await ds.query(`ALTER TABLE kb_inverted_index DROP CONSTRAINT IF EXISTS "${r.conname}"`)
    }
    return
  }

  // SQLite：PRAGMA foreign_key_list 有行才需要重建
  const fks = (await ds.query('PRAGMA foreign_key_list(kb_inverted_index)')) as Array<Record<string, unknown>>
  if (fks.length === 0) return

  await ds.query(`
    CREATE TABLE kb_inverted_index__fix (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      knowledge_base_id TEXT NOT NULL,
      term_frequency INTEGER DEFAULT 1,
      positions TEXT
    )
  `)
  await ds.query(
    'INSERT INTO kb_inverted_index__fix (id, term, chunk_id, knowledge_base_id, term_frequency, positions) SELECT id, term, chunk_id, knowledge_base_id, term_frequency, positions FROM kb_inverted_index',
  )
  await ds.query('DROP TABLE kb_inverted_index')
  await ds.query('ALTER TABLE kb_inverted_index__fix RENAME TO kb_inverted_index')
  await ds.query('CREATE INDEX idx_kb_inverted_index_term ON kb_inverted_index (term)')
  await ds.query('CREATE INDEX idx_kb_inverted_index_chunk_id ON kb_inverted_index (chunk_id)')
}
