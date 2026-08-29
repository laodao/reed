/**
 * create-pack-tables 迁移执行测试（业务包内核第一期）
 * @module tests/migrations/create-pack-tables
 * @description 真实 sqlite DataSource 执行（照 create-builtin-apps.spec 惯例）：
 *              建 business_packs / business_pack_bindings 两表 + 索引，
 *              幂等重跑不报错，表达式唯一索引挡住重复全局行。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import { createPackTables } from '@core/database/migrations/create-pack-tables'
import { BusinessPackEntity } from '@core/database/entities/business-pack.entity'
import { BusinessPackBindingEntity } from '@core/database/entities/business-pack-binding.entity'

let ds: DataSource

beforeAll(async () => {
  ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [BusinessPackEntity, BusinessPackBindingEntity],
    synchronize: false,
  })
  await ds.initialize()
  await createPackTables(ds)
})

afterAll(async () => {
  await ds.destroy()
})

describe('create-pack-tables 迁移执行（真实 sqlite）', () => {
  it('建 business_packs 表（pack_id 主键 + 快照列 + 启用态）', async () => {
    const cols = await ds.query(`SELECT name FROM pragma_table_info('business_packs')`)
    const names = cols.map((c: { name: string }) => c.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'pack_id', 'name', 'version', 'manifest_json', 'manifest_hash',
        'source', 'enabled', 'created_at', 'updated_at',
      ]),
    )
    const pk = await ds.query(`SELECT name FROM pragma_table_info('business_packs') WHERE pk > 0`)
    expect(pk.map((c: { name: string }) => c.name)).toEqual(['pack_id'])
  })

  it('建 business_pack_bindings 表（id 代理主键 + user_id 可空）', async () => {
    const cols = await ds.query(`SELECT name, "notnull" FROM pragma_table_info('business_pack_bindings')`)
    const byName = new Map(cols.map((c: { name: string; notnull: number }) => [c.name, c.notnull]))
    for (const n of ['id', 'pack_id', 'user_id', 'enabled', 'config_json', 'created_at', 'updated_at']) {
      expect(byName.has(n)).toBe(true)
    }
    expect(byName.get('user_id')).toBe(0) // 可空：NULL = 全局默认行
    const pk = await ds.query(`SELECT name FROM pragma_table_info('business_pack_bindings') WHERE pk > 0`)
    expect(pk.map((c: { name: string }) => c.name)).toEqual(['id'])
  })

  it('建索引：idx_bpb_pack + 表达式唯一索引 idx_bpb_pack_user', async () => {
    const rows = await ds.query(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'business_pack_bindings'`,
    )
    const names = rows.map((r: { name: string }) => r.name)
    expect(names).toContain('idx_bpb_pack')
    expect(names).toContain('idx_bpb_pack_user')
  })

  it('表达式唯一索引约束：全局行（user_id NULL）不可重复；per-user 行互不影响', async () => {
    const now = new Date().toISOString()
    await ds.query(
      `INSERT INTO business_pack_bindings (id, pack_id, user_id, enabled, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, ?)`,
      ['alpha#@global', 'alpha', now, now],
    )
    // 第二个全局行（不同代理 id）：普通 UNIQUE 约束挡不住 NULL，表达式索引必须挡住
    await expect(
      ds.query(
        `INSERT INTO business_pack_bindings (id, pack_id, user_id, enabled, created_at, updated_at) VALUES (?, ?, NULL, 0, ?, ?)`,
        ['alpha#@global2', 'alpha', now, now],
      ),
    ).rejects.toThrow()
    // per-user 行正常
    await ds.query(
      `INSERT INTO business_pack_bindings (id, pack_id, user_id, enabled, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)`,
      ['alpha#user-1', 'alpha', 'user-1', now, now],
    )
    const rows = await ds.query(`SELECT id FROM business_pack_bindings WHERE pack_id = 'alpha'`)
    expect(rows.length).toBe(2)
  })

  it('幂等：重跑不报错、表结构与数据不变', async () => {
    const before = await ds.query(`SELECT count(*) c FROM business_pack_bindings`)
    await createPackTables(ds)
    await createPackTables(ds)
    const after = await ds.query(`SELECT count(*) c FROM business_pack_bindings`)
    expect(after[0].c).toBe(before[0].c)
  })
})
