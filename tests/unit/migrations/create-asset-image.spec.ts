import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { createAssetImage } from '@core/database/migrations/create-asset-image'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [], synchronize: false })
  await ds.initialize()
  await ds.query(`CREATE TABLE character_bindings (id TEXT PRIMARY KEY, image_paths TEXT)`)
  await ds.query(`CREATE TABLE location_bindings (id TEXT PRIMARY KEY, image_paths TEXT)`)
  await ds.query(`CREATE TABLE item_bindings (id TEXT PRIMARY KEY, image_paths TEXT)`)
  return ds
}

describe('createAssetImage migration', () => {
  it('建表后所有列存在', async () => {
    const ds = await buildLegacyDb()
    await createAssetImage(ds)
    const cols = (await ds.query(`SELECT name FROM pragma_table_info('asset_image')`))
      .map((r: any) => r.name)
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'user_id', 'asset_type', 'asset_id', 'category', 'label',
      'prompt', 'negative_prompt', 'image_path', 'thumbnail_path',
      'is_main', 'derived_from_image_id', 'sort_order', 'metadata',
      'created_at', 'updated_at',
    ]))
    await ds.destroy()
  })

  it('搬运 character_binding.image_paths：首张为 main，其余为 view', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO character_bindings (id, image_paths) VALUES
      ('cb1', '["/img/a.png","/img/b.png","/img/c.png"]'),
      ('cb2', '[]'),
      ('cb3', NULL)`)
    await createAssetImage(ds)
    const rows = await ds.query(
      `SELECT asset_id, category, is_main, image_path, sort_order FROM asset_image WHERE asset_type='character' ORDER BY asset_id, sort_order`,
    )
    expect(rows).toEqual([
      { asset_id: 'cb1', category: 'main', is_main: 1, image_path: '/img/a.png', sort_order: 0 },
      { asset_id: 'cb1', category: 'view',  is_main: 0, image_path: '/img/b.png', sort_order: 1 },
      { asset_id: 'cb1', category: 'view',  is_main: 0, image_path: '/img/c.png', sort_order: 2 },
    ])
    await ds.destroy()
  })

  it('幂等：第二次跑不重复插入', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO character_bindings (id, image_paths) VALUES ('cb1', '["/img/a.png"]')`)
    await createAssetImage(ds)
    await createAssetImage(ds)
    const count = (await ds.query(`SELECT count(*) as c FROM asset_image`))[0].c
    expect(count).toBe(1)
    await ds.destroy()
  })
})
