/**
 * add-location-parent-id migration 单测（2026-09-21 地点层级）
 *
 * 验证：
 *   1. 老表（无 parent_id）执行后加列成功，存量行 parent_id 为 NULL；
 *   2. 幂等：第二次执行无变更、不报错；
 *   3. 表不存在时安全跳过。
 */

import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { addLocationParentId } from '@core/database/migrations/add-location-parent-id'

async function buildDb(withTable = true): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  if (withTable) {
    await ds.query(`CREATE TABLE location_bindings (
      id TEXT PRIMARY KEY, project_id TEXT, location_name TEXT
    )`)
  }
  return ds
}

async function columnNames(ds: DataSource, table: string): Promise<string[]> {
  const rows = await ds.query(`SELECT name FROM pragma_table_info(?)`, [table])
  return rows.map((r: any) => r.name)
}

describe('add-location-parent-id', () => {
  it('老表加列 parent_id，存量行值为 NULL', async () => {
    const ds = await buildDb()
    try {
      await ds.query(
        `INSERT INTO location_bindings (id, project_id, location_name) VALUES ('lb1', 'p1', '雪麓山庄')`,
      )
      await addLocationParentId(ds)
      const cols = await columnNames(ds, 'location_bindings')
      expect(cols).toContain('parent_id')
      const rows = await ds.query(`SELECT parent_id FROM location_bindings WHERE id = 'lb1'`)
      expect(rows[0].parent_id).toBeNull()
    } finally {
      await ds.destroy()
    }
  })

  it('幂等：重复执行不报错、列不重复', async () => {
    const ds = await buildDb()
    try {
      await addLocationParentId(ds)
      await addLocationParentId(ds)
      const cols = await columnNames(ds, 'location_bindings')
      expect(cols.filter((c) => c === 'parent_id')).toHaveLength(1)
    } finally {
      await ds.destroy()
    }
  })

  it('表不存在时安全跳过', async () => {
    const ds = await buildDb(false)
    try {
      await expect(addLocationParentId(ds)).resolves.toBeUndefined()
    } finally {
      await ds.destroy()
    }
  })
})
