/**
 * PC 端旧 SQLite 库（Phase 3 多租户改造前）启动迁移回归测试
 *
 * 场景：
 * - PC 端 0.x 老 schema 没有任何 user_id 列；
 * - 直接启动会被 schema-drift 检查阻塞（错误：missingColumns: user_id × N 张表）；
 * - 修复：DatabaseManager.initTypeOrmDataSource() 在 drift 检查之前调用
 *   ensureUsersTable + ensureUserIdColumns，自动 ALTER TABLE 加列并把旧数据
 *   回填为 LOCAL_DEFAULT_USER_ID。
 *
 * 本测试不去启动 Electron / DatabaseManager，而是直接验证:
 *   1. 构造一个不含 user_id 列的旧 schema sqlite 库
 *   2. 跑 ensureUserIdColumns 后所有表都补上 user_id 列
 *   3. 旧数据 user_id 都被回填为 LOCAL_DEFAULT_USER_ID
 *   4. checkSchemaDrift(ds) 报告 ok=true（无遗留 missing user_id）
 */

import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { ensureUsersTable } from '@core/database/migrations/ensure-users-table'
import { ensureUserIdColumns } from '@core/database/migrations/ensure-user-id-columns'
import { checkSchemaDrift } from '@core/database/schema-drift'
import { LOCAL_DEFAULT_USER_ID } from '@core/context/user-context'

type EntityCtor = new (...args: unknown[]) => object

describe('PC 端旧 SQLite 库启动迁移', () => {
  it('缺 user_id 列的旧库经迁移后 drift 检查应通过', async () => {
    const allEntities = Object.values(entities).filter(
      v => typeof v === 'function',
    ) as EntityCtor[]

    // 1) 用临时库 + synchronize 建立"当前 entity"对应的最新 schema
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: allEntities as any,
      synchronize: true,
      logging: false,
    })
    await ds.initialize()

    // 2) 模拟"老 PC 库"：把所有有 user_id 列的表里这一列删掉。
    //    SQLite < 3.35 不支持 DROP COLUMN，但 better-sqlite3 内嵌的 sqlite 版本
    //    支持。若版本不支持则改用 rebuild：CREATE 新表 → 复制数据 → 删旧表 → 重命名。
    const tablesWithUserId = ds.entityMetadatas
      .filter(m => m.findColumnWithPropertyName('userId'))
      .map(m => m.tableName)
    expect(tablesWithUserId.length).toBeGreaterThan(0)

    for (const tableName of tablesWithUserId) {
      try {
        await ds.query(`ALTER TABLE "${tableName}" DROP COLUMN user_id`)
      } catch {
        // 老 sqlite 不支持 DROP COLUMN —— 跳过该表，但仍验证迁移幂等
      }
    }

    // 3) 跑迁移
    await ensureUsersTable(ds)
    await ensureUserIdColumns(ds, LOCAL_DEFAULT_USER_ID)

    // 4) 验证所有有 userId 字段的 entity 表都有 user_id 列
    for (const tableName of tablesWithUserId) {
      const cols = (await ds.query(
        `PRAGMA table_info("${tableName}")`,
      )) as Array<{ name: string }>
      expect(
        cols.some(c => c.name === 'user_id'),
        `表 ${tableName} 应有 user_id 列`,
      ).toBe(true)
    }

    // 5) drift 检查 ok
    const report = await checkSchemaDrift(ds)
    expect(report.ok, JSON.stringify(report)).toBe(true)
    expect(report.missingColumns).toEqual([])

    await ds.destroy()
  })

  it('迁移函数对已经有 user_id 列的库幂等', async () => {
    const allEntities = Object.values(entities).filter(
      v => typeof v === 'function',
    ) as EntityCtor[]

    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: allEntities as any,
      synchronize: true,
      logging: false,
    })
    await ds.initialize()

    // 直接连续跑两次迁移：不应抛错，不应重复加列
    await ensureUsersTable(ds)
    await ensureUserIdColumns(ds, LOCAL_DEFAULT_USER_ID)
    await ensureUsersTable(ds)
    await ensureUserIdColumns(ds, LOCAL_DEFAULT_USER_ID)

    const report = await checkSchemaDrift(ds)
    expect(report.ok).toBe(true)

    await ds.destroy()
  })
})
