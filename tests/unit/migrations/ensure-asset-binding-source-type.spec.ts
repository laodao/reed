import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { ensureAssetBindingSourceType } from '@core/database/migrations/ensure-asset-binding-source-type'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  // 旧 schema：3 个 binding 表，无新加字段
  await ds.query(`CREATE TABLE character_bindings (
    id TEXT PRIMARY KEY, project_id TEXT, long_writing_character_id TEXT,
    portrait_id TEXT, voice_id TEXT
  )`)
  await ds.query(`CREATE TABLE location_bindings (
    id TEXT PRIMARY KEY, project_id TEXT, long_writing_location_id TEXT,
    location_name TEXT, image_paths TEXT
  )`)
  await ds.query(`CREATE TABLE item_bindings (
    id TEXT PRIMARY KEY, project_id TEXT, long_writing_item_id TEXT,
    item_name TEXT, image_paths TEXT
  )`)
  return ds
}

describe('ensureAssetBindingSourceType migration', () => {
  it('给 3 个 binding 表都加 source_type + override_* + standalone_* 列', async () => {
    const ds = await buildLegacyDb()
    await ensureAssetBindingSourceType(ds)
    const charCols = (await ds.query(`SELECT name FROM pragma_table_info('character_bindings')`))
      .map((r: any) => r.name)
    expect(charCols).toContain('source_type')
    expect(charCols).toContain('override_name')
    expect(charCols).toContain('override_description')
    expect(charCols).toContain('override_appearance')
    expect(charCols).toContain('override_outfit')
    expect(charCols).toContain('standalone_name')
    expect(charCols).toContain('standalone_description')

    const locCols = (await ds.query(`SELECT name FROM pragma_table_info('location_bindings')`))
      .map((r: any) => r.name)
    expect(locCols).toContain('source_type')
    expect(locCols).toContain('panorama_3d_id')
    expect(locCols).toContain('scene_layout_id')

    const itemCols = (await ds.query(`SELECT name FROM pragma_table_info('item_bindings')`))
      .map((r: any) => r.name)
    expect(itemCols).toContain('source_type')

    await ds.destroy()
  })

  it('source_type 按 long_writing_xxx_id 是否非空回填', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO character_bindings (id, project_id, long_writing_character_id) VALUES
      ('a', 'p1', 'lw_c_1'),
      ('b', 'p1', NULL)`)
    await ds.query(`INSERT INTO location_bindings (id, project_id, long_writing_location_id, location_name) VALUES
      ('la', 'p1', 'lw_l_1', 'A'),
      ('lb', 'p1', NULL, 'B')`)
    await ds.query(`INSERT INTO item_bindings (id, project_id, long_writing_item_id, item_name) VALUES
      ('ia', 'p1', 'lw_i_1', 'A'),
      ('ib', 'p1', NULL, 'B')`)

    await ensureAssetBindingSourceType(ds)

    const chars = await ds.query(`SELECT id, source_type FROM character_bindings ORDER BY id`)
    expect(chars).toEqual([
      { id: 'a', source_type: 'linked_lw' },
      { id: 'b', source_type: 'standalone' },
    ])
    const locs = await ds.query(`SELECT id, source_type FROM location_bindings ORDER BY id`)
    expect(locs).toEqual([
      { id: 'la', source_type: 'linked_lw' },
      { id: 'lb', source_type: 'standalone' },
    ])
    const items = await ds.query(`SELECT id, source_type FROM item_bindings ORDER BY id`)
    expect(items).toEqual([
      { id: 'ia', source_type: 'linked_lw' },
      { id: 'ib', source_type: 'standalone' },
    ])

    await ds.destroy()
  })

  it('幂等：重复跑两次数据保持稳定', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO character_bindings (id, project_id, long_writing_character_id) VALUES
      ('a', 'p1', 'lw_c_1'),
      ('b', 'p1', NULL)`)

    await ensureAssetBindingSourceType(ds)
    // 第一次跑后断言
    const after1 = await ds.query(`SELECT id, source_type FROM character_bindings ORDER BY id`)
    expect(after1).toEqual([
      { id: 'a', source_type: 'linked_lw' },
      { id: 'b', source_type: 'standalone' },
    ])

    // 模拟用户手动改了一行的 source_type（应保留不被覆盖）
    await ds.query(`UPDATE character_bindings SET source_type = 'standalone' WHERE id = 'a'`)

    await ensureAssetBindingSourceType(ds)
    // 第二次跑后：手动改的 a 不应被回退；b 仍然 standalone
    const after2 = await ds.query(`SELECT id, source_type FROM character_bindings ORDER BY id`)
    expect(after2).toEqual([
      { id: 'a', source_type: 'standalone' }, // 手动改后保留
      { id: 'b', source_type: 'standalone' },
    ])

    await ds.destroy()
  })
})
