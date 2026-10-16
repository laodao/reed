import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { addKbDocumentSource } from '@core/database/migrations/add-kb-document-source'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  // 模拟 migration 之前的 kb_documents 表（无 source_type / source_id）
  await ds.query(`CREATE TABLE kb_documents (
    id TEXT PRIMARY KEY,
    knowledge_base_id TEXT NOT NULL,
    name TEXT,
    file_path TEXT,
    file_type TEXT,
    file_size INTEGER,
    status TEXT,
    progress INTEGER,
    chunk_count INTEGER,
    error_message TEXT,
    metadata TEXT,
    created_at DATETIME,
    updated_at DATETIME
  )`)
  return ds
}

async function buildEmptyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  return ds
}

describe('migration: add-kb-document-source', () => {
  it('legacy 表加列 + 索引', async () => {
    const ds = await buildLegacyDb()
    try {
      await addKbDocumentSource(ds)

      const cols: Array<{ name: string }> = await ds.query(`PRAGMA table_info('kb_documents')`)
      const names = cols.map(c => c.name)
      expect(names).toContain('source_type')
      expect(names).toContain('source_id')

      const indexes: Array<{ name: string }> = await ds.query(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='kb_documents'`,
      )
      expect(indexes.some(i => i.name === 'idx_kb_documents_source')).toBe(true)
    } finally {
      await ds.destroy()
    }
  })

  it('幂等：重复执行不报错', async () => {
    const ds = await buildLegacyDb()
    try {
      await addKbDocumentSource(ds)
      await addKbDocumentSource(ds)
      // 二次执行不抛异常即通过
    } finally {
      await ds.destroy()
    }
  })

  it('表不存在时静默跳过', async () => {
    const ds = await buildEmptyDb()
    try {
      // 不应抛
      await expect(addKbDocumentSource(ds)).resolves.toBeUndefined()
    } finally {
      await ds.destroy()
    }
  })
})
