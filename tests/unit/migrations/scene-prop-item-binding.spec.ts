import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { ensureScenePropItemBinding } from '@core/database/migrations/scene-prop-item-binding'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [], synchronize: false })
  await ds.initialize()
  await ds.query(`CREATE TABLE scene_props (id TEXT PRIMARY KEY, scene_character_id TEXT, prop_name TEXT)`)
  await ds.query(`CREATE TABLE item_bindings (id TEXT PRIMARY KEY, item_name TEXT, project_id TEXT)`)
  return ds
}

describe('ensureScenePropItemBinding', () => {
  it('加 item_binding_id 列', async () => {
    const ds = await buildLegacyDb()
    await ensureScenePropItemBinding(ds)
    const cols = (await ds.query(`SELECT name FROM pragma_table_info('scene_props')`)).map((r: any) => r.name)
    expect(cols).toContain('item_binding_id')
    await ds.destroy()
  })

  it('按 prop_name 匹配 item_bindings.item_name 自动回填 item_binding_id', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO item_bindings (id, item_name) VALUES ('ib1', '宝剑'), ('ib2', '玉佩')`)
    await ds.query(`INSERT INTO scene_props (id, scene_character_id, prop_name) VALUES
      ('sp1', 'sc1', '宝剑'),
      ('sp2', 'sc1', '玉佩'),
      ('sp3', 'sc1', '不存在的物品')`)
    await ensureScenePropItemBinding(ds)
    const rows = await ds.query(`SELECT id, prop_name, item_binding_id FROM scene_props ORDER BY id`)
    expect(rows).toEqual([
      { id: 'sp1', prop_name: '宝剑', item_binding_id: 'ib1' },
      { id: 'sp2', prop_name: '玉佩', item_binding_id: 'ib2' },
      { id: 'sp3', prop_name: '不存在的物品', item_binding_id: null },
    ])
    await ds.destroy()
  })

  it('幂等：重复跑两次不报错且数据不变', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO item_bindings (id, item_name) VALUES ('ib1', '宝剑')`)
    await ds.query(`INSERT INTO scene_props (id, scene_character_id, prop_name) VALUES ('sp1', 'sc1', '宝剑')`)
    await ensureScenePropItemBinding(ds)
    await ensureScenePropItemBinding(ds)
    const r = await ds.query(`SELECT item_binding_id FROM scene_props WHERE id='sp1'`)
    expect(r[0].item_binding_id).toBe('ib1')
    await ds.destroy()
  })
})
