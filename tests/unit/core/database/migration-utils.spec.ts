/**
 * 迁移工具 ensureColumn 测试（M2-C：老库补列升级路径）
 * @module tests/unit/core/database/migration-utils.spec
 *
 * 场景：dl_project 老库（无 pace_settings 列）→ 跑 createDomainLearningTables
 * 幂等补列；重复执行不报错；SQLite 与 PG 同契约（此处覆盖 SQLite 内存库）。
 */

import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { checkColumnExists } from '@core/database/migrations/migration-utils'
import { createDomainLearningTables } from '@core/database/migrations/create-domain-learning-tables'

describe('migration-utils ensureColumn（dl_project.pace_settings 升级）', () => {
  it('老库缺列 → 补列成功且幂等', async () => {
    const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false })
    await ds.initialize()
    // 模拟 M1 老库：dl_project 无 pace_settings 列（其余表不存在，迁移会顺带建）
    await ds.query(`CREATE TABLE dl_project (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      goal TEXT NOT NULL,
      profile_id TEXT,
      profile_json TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      description TEXT,
      kb_id TEXT,
      default_model TEXT,
      created_at DATETIME,
      updated_at DATETIME
    )`)
    const isPg = ds.options.type === 'postgres'

    expect(await checkColumnExists(ds, 'dl_project', 'pace_settings', isPg)).toBe(false)
    // 迁移跑两遍：第一遍补列 + 建其余表；第二遍幂等不报错
    await createDomainLearningTables(ds)
    await createDomainLearningTables(ds)
    expect(await checkColumnExists(ds, 'dl_project', 'pace_settings', isPg)).toBe(true)

    await ds.destroy()
  })
})
