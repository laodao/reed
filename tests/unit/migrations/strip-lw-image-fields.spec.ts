import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { stripLwImageFields } from '@core/database/migrations/strip-lw-image-fields'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [], synchronize: false })
  await ds.initialize()
  await ds.query(`CREATE TABLE lw_story_characters (id TEXT PRIMARY KEY, portrait_id TEXT, generated_image_id TEXT)`)
  await ds.query(`CREATE TABLE lw_story_locations (id TEXT PRIMARY KEY, generated_image_id TEXT)`)
  await ds.query(`CREATE TABLE character_bindings (id TEXT PRIMARY KEY, long_writing_character_id TEXT, portrait_id TEXT)`)
  await ds.query(`CREATE TABLE location_bindings (id TEXT PRIMARY KEY, long_writing_location_id TEXT)`)
  await ds.query(`CREATE TABLE asset_image (
    id TEXT PRIMARY KEY, asset_type TEXT, asset_id TEXT, category TEXT,
    image_path TEXT, is_main INTEGER, sort_order INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  return ds
}

describe('stripLwImageFields', () => {
  it('lw_character.portrait_id 回填到 character_binding.portrait_id（仅当 binding 当前为空）', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO lw_story_characters (id, portrait_id) VALUES ('lwc1', 'p_a'), ('lwc2', 'p_b')`)
    await ds.query(`INSERT INTO character_bindings (id, long_writing_character_id, portrait_id) VALUES
      ('cb1', 'lwc1', NULL),
      ('cb2', 'lwc2', 'p_existing')`)
    await stripLwImageFields(ds)
    const rows = await ds.query(`SELECT id, portrait_id FROM character_bindings ORDER BY id`)
    expect(rows).toEqual([
      { id: 'cb1', portrait_id: 'p_a' },          // 回填
      { id: 'cb2', portrait_id: 'p_existing' },   // 不覆盖
    ])
    await ds.destroy()
  })

  it('lw_character.generated_image_id 写入 asset_image 作 main', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO lw_story_characters (id, generated_image_id) VALUES ('lwc1', '/img/x.png')`)
    await ds.query(`INSERT INTO character_bindings (id, long_writing_character_id) VALUES ('cb1', 'lwc1')`)
    await stripLwImageFields(ds)
    const rows = await ds.query(`SELECT asset_type, asset_id, category, image_path, is_main FROM asset_image`)
    expect(rows).toEqual([
      { asset_type: 'character', asset_id: 'cb1', category: 'main', image_path: '/img/x.png', is_main: 1 },
    ])
    await ds.destroy()
  })

  it('lw_location.generated_image_id 同样写 asset_image', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO lw_story_locations (id, generated_image_id) VALUES ('lwl1', '/img/loc.png')`)
    await ds.query(`INSERT INTO location_bindings (id, long_writing_location_id) VALUES ('lb1', 'lwl1')`)
    await stripLwImageFields(ds)
    const rows = await ds.query(`SELECT asset_type, asset_id, category, image_path FROM asset_image`)
    expect(rows).toEqual([
      { asset_type: 'location', asset_id: 'lb1', category: 'main', image_path: '/img/loc.png' },
    ])
    await ds.destroy()
  })

  it('幂等', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO lw_story_characters (id, generated_image_id) VALUES ('lwc1', '/img/x.png')`)
    await ds.query(`INSERT INTO character_bindings (id, long_writing_character_id) VALUES ('cb1', 'lwc1')`)
    await stripLwImageFields(ds)
    await stripLwImageFields(ds)
    const c = (await ds.query(`SELECT count(*) as c FROM asset_image`))[0].c
    expect(c).toBe(1)
    await ds.destroy()
  })
})
