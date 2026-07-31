/**
 * 步骤0 阶段3：extendKbVectorsMetadata migration 测试
 * @description sqlite 上为 no-op（不报错）；PG 端逻辑由集成测试覆盖（需 PG Docker）
 */

import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { extendKbVectorsMetadata } from '@core/database/migrations/extend-kb-vectors-metadata'

describe('extendKbVectorsMetadata migration', () => {
  it('sqlite 上 no-op（不报错，不建表）', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    })
    await ds.initialize()

    // sqlite 上应该直接返回，不报错
    await expect(extendKbVectorsMetadata(ds)).resolves.not.toThrow()

    // 不应主动建 kb_vectors 表（那是 LanceDB 管的）
    const rows = await ds.query(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name='kb_vectors'`,
    )
    expect(rows).toHaveLength(0)

    await ds.destroy()
  })

  it('幂等：sqlite 上连调不报错', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    })
    await ds.initialize()
    await extendKbVectorsMetadata(ds)
    await expect(extendKbVectorsMetadata(ds)).resolves.not.toThrow()
    await ds.destroy()
  })
})
