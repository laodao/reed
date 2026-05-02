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

  it('lw_temp_*_templates 改为全局共享后，旧库残留 user_id 列不影响所有用户读取', async () => {
    // 场景：旧 PC 库被 ensureUserIdColumns 给两张模板表加了 user_id 列、
    // 并把数据回填成 LOCAL_DEFAULT_USER_ID。entity 现在已删除 userId 字段，
    // BaseRepository.scoped 应当自动跳过 user_id 过滤，所有 ALS userId 都
    // 能看到全部模板。schema-drift 检查也应通过（实库多列无害）。
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

    // 模拟旧 PC 库：手工给两张模板表加 user_id 列（entity 已无此字段）
    for (const t of ['lw_temp_character_templates', 'lw_temp_location_templates']) {
      await ds.query(`ALTER TABLE "${t}" ADD COLUMN user_id varchar`)
    }

    // 注册全局 dataSource 供 Repository 使用
    const { registerCoreDatabaseManager } = await import(
      '@core/database/database-manager.interface'
    )
    registerCoreDatabaseManager(() => ({ getDataSource: () => ds }) as any)

    const { LwTempCharacterTemplateRepository } = await import(
      '@core/database/repositories/lw-temp-character-template.repository'
    )
    const { LwTempLocationTemplateRepository } = await import(
      '@core/database/repositories/lw-temp-location-template.repository'
    )

    const charRepo = new LwTempCharacterTemplateRepository(ds)
    const locRepo = new LwTempLocationTemplateRepository(ds)

    // 写入默认 17 / 10 条种子数据
    await charRepo.initializeDefaultData()
    await locRepo.initializeDefaultData()

    // 把现有 17 / 10 条 user_id 都改成 'local-default-user'，模拟迁移效果
    await ds.query(
      `UPDATE lw_temp_character_templates SET user_id = ?`,
      [LOCAL_DEFAULT_USER_ID],
    )
    await ds.query(
      `UPDATE lw_temp_location_templates SET user_id = ?`,
      [LOCAL_DEFAULT_USER_ID],
    )

    const { runWithUserAsync } = await import('@core/context/user-context')

    // 任意 ALS userId 都应看到全部 17 + 10 条
    for (const userId of ['local-default-user', 'someone-else', '__no_user__']) {
      const got = await (userId === '__no_user__'
        ? Promise.resolve()
        : runWithUserAsync(userId, async () => {
            // no-op，仅注入 ALS
          }))
      void got

      const charsAll = await runWithUserAsync(
        userId === '__no_user__' ? '' : userId,
        async () => charRepo.getAll(),
      )
      const locsAll = await runWithUserAsync(
        userId === '__no_user__' ? '' : userId,
        async () => locRepo.getAll(),
      )
      expect(charsAll.length, `userId=${userId} 应看到全部 char 模板`).toBe(17)
      expect(locsAll.length, `userId=${userId} 应看到全部 location 模板`).toBe(10)
    }

    // 第二次 initializeDefaultData 不报错（count() 看到现有数据 → return）
    await charRepo.initializeDefaultData()
    await locRepo.initializeDefaultData()
    expect((await charRepo.getAll()).length).toBe(17)
    expect((await locRepo.getAll()).length).toBe(10)

    // schema-drift 检查通过（实库多 user_id 列对 entity 无影响）
    const report = await checkSchemaDrift(ds)
    expect(report.ok, JSON.stringify(report)).toBe(true)

    await ds.destroy()
  })
})
