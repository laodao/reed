/**
 * 双方言测试 DataSource fixture
 * @description sqlite 用 :memory:，postgres 用 Docker 容器（独立 schema 隔离）。
 *              PG 路径用 DataSource.schema 选项保证连接池所有连接都使用测试 schema，
 *              避免 SET search_path 在不同连接上失效的问题。
 */

import { DataSource } from 'typeorm'
import { createDataSource } from '@core/database/data-source'
import type { DbDialect } from '@core/database/config'
import * as entities from '@core/database/entities'

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
 * - postgres: 创建独立 schema（test_<ts>_<rand>），通过 DataSource.schema 绑定
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
  const host = process.env.PGHOST ?? 'localhost'
  const port = Number(process.env.PGPORT ?? 5432)
  const username = process.env.PGUSER ?? 'postgres'
  const password = process.env.PGPASSWORD ?? 'postgres'
  const database = process.env.PGDATABASE ?? 'the_bot_test'

  // 第一步：用 public schema 连接创建 schema
  const adminDs = new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    synchronize: false,
  })
  await adminDs.initialize()
  await adminDs.query(`CREATE SCHEMA "${schemaName}"`)
  await adminDs.destroy()

  // 第二步：用绑定到测试 schema 的 DataSource，连接池每个连接默认使用此 schema
  const allEntities = Object.values(entities).filter(
    v => typeof v === 'function',
  ) as Function[]
  const ds = new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    schema: schemaName,
    entities: allEntities as any,
    synchronize: false,
  })
  await ds.initialize()
  await ds.synchronize()

  return wrap(ds, async () => {
    // 关闭测试 DS 后再用 admin 连接 DROP
    const cleanupDs = new DataSource({
      type: 'postgres',
      host,
      port,
      username,
      password,
      database,
      synchronize: false,
    })
    await cleanupDs.initialize()
    await cleanupDs.query(`DROP SCHEMA "${schemaName}" CASCADE`)
    await cleanupDs.destroy()
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
        await ds.destroy()
      } finally {
        if (beforeClose) await beforeClose()
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
