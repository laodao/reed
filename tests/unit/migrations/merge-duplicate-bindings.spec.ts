/**
 * merge-duplicate-bindings migration 单测（2026-09-21 资产绑定去重归一）
 *
 * 验证：
 *   1. character 同名重复合并：保留"有 confirmed 图的最早一条"，引用全量重指向，
 *      asset_image 只改归属不删图，多余 binding 行删除；
 *   2. location 前缀归一并组："雪麓山庄书房" 并入 "书房"；
 *   3. 防误并："白鹿城" vs "白鹿城门口" 不合并；
 *   4. item 同名合并 + storyboards.item_binding_ids / scene_props 重指向；
 *   5. 幂等：第二次执行无变更；
 *   6. 表不存在时安全跳过。
 */

import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { mergeDuplicateBindings } from '@core/database/migrations/merge-duplicate-bindings'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  await ds.query(`CREATE TABLE character_bindings (
    id TEXT PRIMARY KEY, project_id TEXT, standalone_name TEXT, override_name TEXT, created_at TEXT
  )`)
  await ds.query(`CREATE TABLE location_bindings (
    id TEXT PRIMARY KEY, project_id TEXT, standalone_name TEXT, override_name TEXT, location_name TEXT, created_at TEXT
  )`)
  await ds.query(`CREATE TABLE item_bindings (
    id TEXT PRIMARY KEY, project_id TEXT, standalone_name TEXT, override_name TEXT, item_name TEXT, created_at TEXT
  )`)
  await ds.query(`CREATE TABLE asset_image (
    id TEXT PRIMARY KEY, asset_type TEXT, asset_id TEXT, confirmed INTEGER DEFAULT 0
  )`)
  await ds.query(`CREATE TABLE scene_scripts (
    id TEXT PRIMARY KEY, characters TEXT, location_binding_id TEXT, updated_at TEXT
  )`)
  await ds.query(`CREATE TABLE scene_characters (
    id TEXT PRIMARY KEY, character_binding_id TEXT
  )`)
  await ds.query(`CREATE TABLE storyboards (
    id TEXT PRIMARY KEY, characters TEXT, location_binding_ids TEXT, item_binding_ids TEXT, updated_at TEXT
  )`)
  await ds.query(`CREATE TABLE storyboard_characters (
    id TEXT PRIMARY KEY, character_id TEXT
  )`)
  await ds.query(`CREATE TABLE scene_props (
    id TEXT PRIMARY KEY, item_binding_id TEXT
  )`)
  return ds
}

async function seedChar(
  ds: DataSource,
  id: string,
  name: string,
  createdAt: string,
): Promise<void> {
  await ds.query(
    `INSERT INTO character_bindings (id, project_id, standalone_name, override_name, created_at) VALUES (?, 'p1', ?, NULL, ?)`,
    [id, name, createdAt],
  )
}

async function seedLoc(
  ds: DataSource,
  id: string,
  standaloneName: string | null,
  locationName: string | null,
  createdAt: string,
): Promise<void> {
  await ds.query(
    `INSERT INTO location_bindings (id, project_id, standalone_name, override_name, location_name, created_at) VALUES (?, 'p1', ?, NULL, ?, ?)`,
    [id, standaloneName, locationName, createdAt],
  )
}

describe('mergeDuplicateBindings', () => {
  it('character：同名重复合并，confirmed 图所在者优先保留，引用重指向', async () => {
    const ds = await buildDb()
    await seedChar(ds, 'cb_early', '沈云萝', '2026-01-01T00:00:00Z')
    await seedChar(ds, 'cb_late', '沈　云萝', '2026-02-01T00:00:00Z')
    // cb_late 有 confirmed 定妆图 → 保留 cb_late
    await ds.query(
      `INSERT INTO asset_image (id, asset_type, asset_id, confirmed) VALUES ('img1', 'character', 'cb_late', 1)`,
    )
    await ds.query(
      `INSERT INTO asset_image (id, asset_type, asset_id, confirmed) VALUES ('img2', 'character', 'cb_early', 0)`,
    )
    await ds.query(
      `INSERT INTO scene_scripts (id, characters) VALUES ('ss1', ?)`,
      [JSON.stringify([{ characterBindingId: 'cb_early', characterName: '沈云萝' }])],
    )
    await ds.query(
      `INSERT INTO scene_characters (id, character_binding_id) VALUES ('sc1', 'cb_early')`,
    )
    await ds.query(
      `INSERT INTO storyboards (id, characters) VALUES ('sb1', ?)`,
      [JSON.stringify([{ characterId: 'cb_early', expression: '冷静' }])],
    )
    await ds.query(
      `INSERT INTO storyboard_characters (id, character_id) VALUES ('sbc1', 'cb_early')`,
    )

    const stat = await mergeDuplicateBindings(ds)
    expect(stat.charactersMerged).toBe(1)

    const remaining = await ds.query(`SELECT id FROM character_bindings`)
    expect(remaining.map((r: any) => r.id)).toEqual(['cb_late'])

    // 引用全部指向保留者
    const ss = await ds.query(`SELECT characters FROM scene_scripts WHERE id='ss1'`)
    expect(JSON.parse(ss[0].characters)[0].characterBindingId).toBe('cb_late')
    const sc = await ds.query(`SELECT character_binding_id FROM scene_characters WHERE id='sc1'`)
    expect(sc[0].character_binding_id).toBe('cb_late')
    const sb = await ds.query(`SELECT characters FROM storyboards WHERE id='sb1'`)
    expect(JSON.parse(sb[0].characters)[0].characterId).toBe('cb_late')
    const sbc = await ds.query(`SELECT character_id FROM storyboard_characters WHERE id='sbc1'`)
    expect(sbc[0].character_id).toBe('cb_late')

    // asset_image 只改归属不删图
    const imgs = await ds.query(`SELECT id, asset_id FROM asset_image ORDER BY id`)
    expect(imgs).toEqual([
      { id: 'img1', asset_id: 'cb_late' },
      { id: 'img2', asset_id: 'cb_late' },
    ])
    await ds.destroy()
  })

  it('character：都无 confirmed 图时保留最早一条', async () => {
    const ds = await buildDb()
    await seedChar(ds, 'cb_early', '秦越', '2026-01-01T00:00:00Z')
    await seedChar(ds, 'cb_late', '《秦越》', '2026-02-01T00:00:00Z')

    const stat = await mergeDuplicateBindings(ds)
    expect(stat.charactersMerged).toBe(1)
    const remaining = await ds.query(`SELECT id FROM character_bindings`)
    expect(remaining.map((r: any) => r.id)).toEqual(['cb_early'])
    await ds.destroy()
  })

  it('location：前缀归一并组（"雪麓山庄书房" 并入 "书房"），双轨列参与分组', async () => {
    const ds = await buildDb()
    await seedLoc(ds, 'lb_manor', '雪麓山庄', '雪麓山庄', '2026-01-01T00:00:00Z')
    await seedLoc(ds, 'lb_study', '书房', '书房', '2026-01-02T00:00:00Z')
    // 只有 location_name 的 repository 路径产物
    await seedLoc(ds, 'lb_study_full', null, '雪麓山庄书房', '2026-01-03T00:00:00Z')
    await ds.query(
      `INSERT INTO scene_scripts (id, location_binding_id) VALUES ('ss1', 'lb_study_full')`,
    )
    await ds.query(
      `INSERT INTO storyboards (id, location_binding_ids) VALUES ('sb1', ?)`,
      [JSON.stringify(['lb_study_full'])],
    )

    const stat = await mergeDuplicateBindings(ds)
    expect(stat.locationsMerged).toBe(1)

    const remaining = await ds.query(`SELECT id FROM location_bindings ORDER BY id`)
    expect(remaining.map((r: any) => r.id)).toEqual(['lb_manor', 'lb_study'])
    const ss = await ds.query(`SELECT location_binding_id FROM scene_scripts WHERE id='ss1'`)
    expect(ss[0].location_binding_id).toBe('lb_study')
    const sb = await ds.query(`SELECT location_binding_ids FROM storyboards WHERE id='sb1'`)
    expect(JSON.parse(sb[0].location_binding_ids)).toEqual(['lb_study'])
    await ds.destroy()
  })

  it('location：防误并（"白鹿城" vs "白鹿城门口" 不合并）', async () => {
    const ds = await buildDb()
    await seedLoc(ds, 'lb_city', '白鹿城', '白鹿城', '2026-01-01T00:00:00Z')
    await seedLoc(ds, 'lb_gate', '白鹿城门口', '白鹿城门口', '2026-01-02T00:00:00Z')

    const stat = await mergeDuplicateBindings(ds)
    expect(stat.locationsMerged).toBe(0)
    const remaining = await ds.query(`SELECT id FROM location_bindings ORDER BY id`)
    expect(remaining.map((r: any) => r.id)).toEqual(['lb_city', 'lb_gate'])
    await ds.destroy()
  })

  it('item：同名合并 + item_binding_ids / scene_props 重指向', async () => {
    const ds = await buildDb()
    await ds.query(
      `INSERT INTO item_bindings (id, project_id, standalone_name, item_name, created_at) VALUES ('ib1', 'p1', '青龙剑', '青龙剑', '2026-01-01T00:00:00Z')`,
    )
    await ds.query(
      `INSERT INTO item_bindings (id, project_id, standalone_name, item_name, created_at) VALUES ('ib2', 'p1', '青龙剑 ', '青龙剑 ', '2026-01-02T00:00:00Z')`,
    )
    await ds.query(
      `INSERT INTO storyboards (id, item_binding_ids) VALUES ('sb1', ?)`,
      [JSON.stringify(['ib2', 'ib1'])],
    )
    await ds.query(`INSERT INTO scene_props (id, item_binding_id) VALUES ('sp1', 'ib2')`)

    const stat = await mergeDuplicateBindings(ds)
    expect(stat.itemsMerged).toBe(1)
    const remaining = await ds.query(`SELECT id FROM item_bindings`)
    expect(remaining.map((r: any) => r.id)).toEqual(['ib1'])
    const sb = await ds.query(`SELECT item_binding_ids FROM storyboards WHERE id='sb1'`)
    expect(JSON.parse(sb[0].item_binding_ids)).toEqual(['ib1', 'ib1'])
    const sp = await ds.query(`SELECT item_binding_id FROM scene_props WHERE id='sp1'`)
    expect(sp[0].item_binding_id).toBe('ib1')
    await ds.destroy()
  })

  it('跨项目不合并', async () => {
    const ds = await buildDb()
    await ds.query(
      `INSERT INTO character_bindings (id, project_id, standalone_name, created_at) VALUES ('cb_p1', 'p1', '沈云萝', '2026-01-01T00:00:00Z')`,
    )
    await ds.query(
      `INSERT INTO character_bindings (id, project_id, standalone_name, created_at) VALUES ('cb_p2', 'p2', '沈云萝', '2026-01-02T00:00:00Z')`,
    )
    const stat = await mergeDuplicateBindings(ds)
    expect(stat.charactersMerged).toBe(0)
    await ds.destroy()
  })

  it('幂等：第二次执行无变更', async () => {
    const ds = await buildDb()
    await seedChar(ds, 'cb_early', '沈云萝', '2026-01-01T00:00:00Z')
    await seedChar(ds, 'cb_late', '沈云萝', '2026-02-01T00:00:00Z')

    const first = await mergeDuplicateBindings(ds)
    expect(first.charactersMerged).toBe(1)
    const second = await mergeDuplicateBindings(ds)
    expect(second.charactersMerged).toBe(0)
    expect(second.referencesRepointed).toBe(0)
    await ds.destroy()
  })

  it('binding 表不存在 → 安全跳过', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    })
    await ds.initialize()
    const stat = await mergeDuplicateBindings(ds)
    expect(stat.charactersMerged).toBe(0)
    await ds.destroy()
  })
})
