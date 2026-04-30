/**
 * 双方言测试 DataSource fixture
 * @description sqlite 用 :memory:，postgres 用 Docker 容器（独立 schema 隔离）。
 */

import { DataSource } from 'typeorm'
import { createDataSource } from '@core/database/data-source'
import type { DbDialect } from '@core/database/config'

export interface TestDataSource {
  ds: DataSource
  /** 清空所有表数据（保留 schema），用例 beforeEach 调用 */
  truncateAll(): Promise<void>
  /** 关闭连接（postgres 还会 DROP SCHEMA） */
  close(): Promise<void>
}

/**
 * 创建测试 DataSource。
 * - sqlite: :memory: + synchronize:true 自动建 schema
 * - postgres: 创建独立 schema（test_<ts>_<rand>），结束 DROP SCHEMA
 */
export async function createTestDataSource(
  dialect: DbDialect,
): Promise<TestDataSource> {
  if (dialect === 'sqlite') {
    const ds = await createDataSource({
      config: { type: 'sqlite', database: ':memory:', enableWal: false },
      synchronizeOnInit: true,
    })
    return wrap(ds)
  }

  const schemaName = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const ds = await createDataSource({
    config: {
      type: 'postgres',
      host: process.env.PGHOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? 5432),
      username: process.env.PGUSER ?? 'postgres',
      password: process.env.PGPASSWORD ?? 'postgres',
      database: process.env.PGDATABASE ?? 'the_bot_test',
    },
    synchronizeOnInit: false,
  })
  await ds.query(`CREATE SCHEMA "${schemaName}"`)
  await ds.query(`SET search_path TO "${schemaName}"`)
  await ds.synchronize()
  return wrap(ds, async () => {
    await ds.query(`DROP SCHEMA "${schemaName}" CASCADE`)
  })
}

function wrap(
  ds: DataSource,
  beforeClose?: () => Promise<unknown>,
): TestDataSource {
  return {
    ds,
    async truncateAll() {
      const meta = ds.entityMetadatas
      for (const m of [...meta].reverse()) {
        await ds.getRepository(m.target).clear()
      }
    },
    async close() {
      try {
        if (beforeClose) await beforeClose()
      } finally {
        await ds.destroy()
      }
    },
  }
}

/** 双方言测试矩阵：默认两个；SKIP_PG_TESTS=1 时只跑 sqlite */
export function getTestDialects(): readonly DbDialect[] {
  return process.env.SKIP_PG_TESTS
    ? (['sqlite'] as const)
    : (['sqlite', 'postgres'] as const)
}
