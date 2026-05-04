/**
 * relaxBindingLwIdNullable migration 单测（follow-up #60）
 *
 * 用 better-sqlite3 内存库模拟"列已 NOT NULL"的旧 schema，验证：
 *   1. 表 / 列不存在时静默跳过
 *   2. 把 standalone 行的 '' 占位回填为 NULL
 *   3. 幂等（重复执行不报错）
 *
 * SQLite 不支持 ALTER COLUMN DROP NOT NULL，迁移在 SQLite 上仅做数据回填，
 * 列约束依赖 typeorm synchronize 应用最新 entity（nullable: true）。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { relaxBindingLwIdNullable } from '@core/database/migrations/relax-binding-lw-id-nullable'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  // 用 nullable 列建表（模拟 entity synchronize 已应用）+ 插入 '' 占位行
  await ds.query(`CREATE TABLE character_bindings (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    long_writing_character_id TEXT,
    source_type TEXT
  )`)
  await ds.query(`CREATE TABLE location_bindings (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    long_writing_location_id TEXT,
    source_type TEXT
  )`)
  await ds.query(`CREATE TABLE item_bindings (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    long_writing_item_id TEXT,
    source_type TEXT
  )`)
  return ds
}

describe('relaxBindingLwIdNullable migration', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildLegacyDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('把 standalone 行的 \'\' 占位回填为 NULL', async () => {
    await ds.query(
      `INSERT INTO character_bindings (id, project_id, long_writing_character_id, source_type) VALUES (?, ?, ?, ?)`,
      ['cb1', 'p1', '', 'standalone'],
    )
    await ds.query(
      `INSERT INTO character_bindings (id, project_id, long_writing_character_id, source_type) VALUES (?, ?, ?, ?)`,
      ['cb2', 'p1', 'lw_x', 'linked_lw'],
    )
    await ds.query(
      `INSERT INTO location_bindings (id, project_id, long_writing_location_id, source_type) VALUES (?, ?, ?, ?)`,
      ['lb1', 'p1', '', 'standalone'],
    )
    await ds.query(
      `INSERT INTO item_bindings (id, project_id, long_writing_item_id, source_type) VALUES (?, ?, ?, ?)`,
      ['ib1', 'p1', '', 'standalone'],
    )

    await relaxBindingLwIdNullable(ds)

    const charRows = await ds.query(
      `SELECT id, long_writing_character_id, source_type FROM character_bindings ORDER BY id`,
    )
    expect(charRows[0]).toMatchObject({
      id: 'cb1',
      long_writing_character_id: null,
      source_type: 'standalone',
    })
    // linked_lw 行不动
    expect(charRows[1]).toMatchObject({
      id: 'cb2',
      long_writing_character_id: 'lw_x',
      source_type: 'linked_lw',
    })

    const locRow = await ds.query(
      `SELECT long_writing_location_id FROM location_bindings WHERE id = 'lb1'`,
    )
    expect(locRow[0].long_writing_location_id).toBeNull()

    const itemRow = await ds.query(
      `SELECT long_writing_item_id FROM item_bindings WHERE id = 'ib1'`,
    )
    expect(itemRow[0].long_writing_item_id).toBeNull()
  })

  it('幂等：第二次跑不报错且不影响数据', async () => {
    await ds.query(
      `INSERT INTO character_bindings (id, project_id, long_writing_character_id, source_type) VALUES (?, ?, ?, ?)`,
      ['cb1', 'p1', '', 'standalone'],
    )
    await relaxBindingLwIdNullable(ds)
    await expect(relaxBindingLwIdNullable(ds)).resolves.not.toThrow()

    const rows = await ds.query(
      `SELECT long_writing_character_id FROM character_bindings WHERE id = 'cb1'`,
    )
    expect(rows[0].long_writing_character_id).toBeNull()
  })

  it('表不存在时静默跳过', async () => {
    const empty = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    })
    await empty.initialize()
    await expect(relaxBindingLwIdNullable(empty)).resolves.not.toThrow()
    await empty.destroy()
  })
})
