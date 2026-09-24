/**
 * fix-kb-inverted-index-fk 迁移测试
 *
 * 回归：真机 kb_inverted_index 带 chunk_id→kb_chunks 外键，统一池伪 chunkId
 * （atom: 前缀）入倒排被 FK 拒绝（凡人修仙传/完美世界真机失败根因）。
 * 迁移须：去掉 FK、保留数据与索引、幂等、迁移后 atom: 行可插入。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import { fixKbInvertedIndexFk } from '@core/database/migrations/fix-kb-inverted-index-fk'

// 真·生产 DDL（含 FK——正是真机炸的那张表的样子）
const PROD_DDL = `
  CREATE TABLE kb_inverted_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term TEXT NOT NULL,
    chunk_id TEXT NOT NULL,
    knowledge_base_id TEXT NOT NULL,
    term_frequency INTEGER DEFAULT 1,
    positions TEXT,
    FOREIGN KEY (chunk_id) REFERENCES kb_chunks(id) ON DELETE CASCADE,
    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
  )
`
const PROD_INDEXES = [
  'CREATE INDEX idx_kb_inverted_index_term ON kb_inverted_index (term)',
  'CREATE INDEX idx_kb_inverted_index_chunk_id ON kb_inverted_index (chunk_id)',
]

// 被 FK 引用的宿主表（最小列即可——SQLite FK 不校验引用列存在性，但建表要能过）
const HOST_DDLS = [
  'CREATE TABLE kb_chunks (id TEXT PRIMARY KEY)',
  'CREATE TABLE knowledge_bases (id TEXT PRIMARY KEY)',
]

describe('fixKbInvertedIndexFk', () => {
  let ds: DataSource

  beforeAll(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:' })
    await ds.initialize()
    for (const ddl of HOST_DDLS) await ds.query(ddl)
    // 宿主行先插（TypeORM better-sqlite3 驱动开 FK——真机失败模式的同款环境）
    await ds.query("INSERT INTO kb_chunks (id) VALUES ('chunk-1'), ('chunk-2')")
    await ds.query("INSERT INTO knowledge_bases (id) VALUES ('kb-1')")
    await ds.query(PROD_DDL)
    for (const idx of PROD_INDEXES) await ds.query(idx)
    await ds.query(
      "INSERT INTO kb_inverted_index (term, chunk_id, knowledge_base_id, term_frequency) VALUES ('修真', 'chunk-1', 'kb-1', 3), ('凡人', 'chunk-2', 'kb-1', 1)",
    )
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('迁移后 FK 消失、数据保留、索引重建', async () => {
    await fixKbInvertedIndexFk(ds)
    const fks = (await ds.query('PRAGMA foreign_key_list(kb_inverted_index)')) as unknown[]
    expect(fks).toHaveLength(0)
    const rows = (await ds.query('SELECT term FROM kb_inverted_index ORDER BY term')) as Array<{ term: string }>
    // SQLite BINARY 排序按 Unicode 码点：修(U+4FEE) < 凡(U+51E1)
    expect(rows.map((r) => r.term).sort()).toEqual(['凡人', '修真'].sort())
    const indexes = (await ds.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='kb_inverted_index' AND name LIKE 'idx_%'",
    )) as Array<{ name: string }>
    expect(indexes.map((i) => i.name).sort()).toEqual(['idx_kb_inverted_index_chunk_id', 'idx_kb_inverted_index_term'])
  })

  it('迁移后 atom: 伪 chunkId 可插入（统一池入队不再被拒）', async () => {
    await ds.query(
      "INSERT INTO kb_inverted_index (term, chunk_id, knowledge_base_id, term_frequency) VALUES ('张小凡', 'atom:abc-1', 'kb-1', 2)",
    )
    const rows = (await ds.query("SELECT COUNT(*) AS n FROM kb_inverted_index WHERE chunk_id LIKE 'atom:%'")) as Array<{ n: number }>
    expect(Number(rows[0].n)).toBe(1)
  })

  it('幂等：重复跑不再重建（FK 已空直接返回）', async () => {
    await fixKbInvertedIndexFk(ds)
    const rows = (await ds.query('SELECT COUNT(*) AS n FROM kb_inverted_index')) as Array<{ n: number }>
    expect(Number(rows[0].n)).toBe(3) // 数据没丢没重拷
  })

  it('表不存在 → 静默跳过', async () => {
    const ds2 = new DataSource({ type: 'better-sqlite3', database: ':memory:' })
    await ds2.initialize()
    await expect(fixKbInvertedIndexFk(ds2)).resolves.toBeUndefined()
    await ds2.destroy()
  })
})
