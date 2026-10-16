/**
 * 步骤0 阶段3：createLwVectorIndices migration 测试（sqlite）
 * @description 验证建表 + 列结构 + 索引 + 幂等
 */

import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { createLwVectorIndices } from '@core/database/migrations/create-lw-vector-indices'

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

async function getColumns(ds: DataSource, table: string): Promise<string[]> {
  const rows = await ds.query(`SELECT name FROM pragma_table_info(?)`, [table])
  return rows.map((r: any) => r.name)
}

async function getIndexes(ds: DataSource, table: string): Promise<string[]> {
  const rows = await ds.query(
    `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name = ?`,
    [table],
  )
  return rows.map((r: any) => r.name)
}

describe('createLwVectorIndices migration', () => {
  it('建 lw_vector_indices 表 + 全部列', async () => {
    const ds = await buildEmptyDb()
    await createLwVectorIndices(ds)

    const cols = await getColumns(ds, 'lw_vector_indices')
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'user_id', 'project_id', 'entity_type', 'entity_id',
        'chapter_number', 'chunk_id', 'content_hash', 'preview',
        'created_at', 'updated_at',
      ]),
    )

    await ds.destroy()
  })

  it('建索引（project / user / entity / unique chunk）', async () => {
    const ds = await buildEmptyDb()
    await createLwVectorIndices(ds)

    const indexes = await getIndexes(ds, 'lw_vector_indices')
    expect(indexes).toEqual(
      expect.arrayContaining([
        'idx_lw_vector_project',
        'idx_lw_vector_user',
        'idx_lw_vector_entity',
        'uq_lw_vector_chunk',
      ]),
    )

    await ds.destroy()
  })

  it('幂等：第二次跑不报错', async () => {
    const ds = await buildEmptyDb()
    await createLwVectorIndices(ds)
    await expect(createLwVectorIndices(ds)).resolves.not.toThrow()

    // 列没重复
    const cols = await getColumns(ds, 'lw_vector_indices')
    expect(cols.filter(c => c === 'chunk_id')).toHaveLength(1)

    await ds.destroy()
  })

  it('uq_lw_vector_chunk 唯一约束生效（chunkId 唯一）', async () => {
    const ds = await buildEmptyDb()
    await createLwVectorIndices(ds)

    await ds.query(
      `INSERT INTO lw_vector_indices (id, project_id, entity_type, entity_id, chunk_id, created_at, updated_at)
       VALUES ('r1', 'p1', 'character', 'c1', 'ck_dup', 1, 1)`,
    )
    await expect(
      ds.query(
        `INSERT INTO lw_vector_indices (id, project_id, entity_type, entity_id, chunk_id, created_at, updated_at)
         VALUES ('r2', 'p1', 'character', 'c2', 'ck_dup', 1, 1)`,
      ),
    ).rejects.toThrow()

    await ds.destroy()
  })
})
