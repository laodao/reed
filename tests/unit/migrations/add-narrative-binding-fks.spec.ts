/**
 * addNarrativeBindingFks migration 单测（P4-T1）
 *
 * 用 better-sqlite3 内存库模拟 V2 老 schema（无 binding_id 列），验证迁移：
 *   1. 给 4 张表（scene_scripts / scene_characters / scene_dialogues / scene_actions）
 *      加上对应 binding_id 列
 *   2. 表 / 列不存在时静默跳过
 *   3. 幂等（重复执行不报错）
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { addNarrativeBindingFks } from '@core/database/migrations/add-narrative-binding-fks'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  // 模拟 V2 老 schema：无 binding_id 列
  await ds.query(`CREATE TABLE scene_scripts (
    id TEXT PRIMARY KEY,
    episode_script_id TEXT,
    location TEXT
  )`)
  await ds.query(`CREATE TABLE scene_characters (
    id TEXT PRIMARY KEY,
    scene_script_id TEXT,
    character_id TEXT
  )`)
  await ds.query(`CREATE TABLE scene_dialogues (
    id TEXT PRIMARY KEY,
    scene_script_id TEXT,
    character_id TEXT,
    voice_id TEXT
  )`)
  await ds.query(`CREATE TABLE scene_actions (
    id TEXT PRIMARY KEY,
    scene_script_id TEXT,
    character_id TEXT
  )`)
  return ds
}

async function listColumns(ds: DataSource, table: string): Promise<string[]> {
  const rows = await ds.query(`SELECT name FROM pragma_table_info(?)`, [table])
  return rows.map((r: { name: string }) => r.name)
}

describe('addNarrativeBindingFks migration', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildLegacyDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('给 4 张表加上对应 binding_id 列', async () => {
    await addNarrativeBindingFks(ds)

    expect(await listColumns(ds, 'scene_scripts')).toContain('location_binding_id')
    expect(await listColumns(ds, 'scene_characters')).toContain('character_binding_id')
    expect(await listColumns(ds, 'scene_dialogues')).toContain('character_binding_id')
    expect(await listColumns(ds, 'scene_actions')).toContain('character_binding_id')
  })

  it('幂等：第二次跑不报错且列只加一次', async () => {
    await addNarrativeBindingFks(ds)
    await expect(addNarrativeBindingFks(ds)).resolves.not.toThrow()
    const cols = await listColumns(ds, 'scene_scripts')
    const matches = cols.filter((c) => c === 'location_binding_id')
    expect(matches).toHaveLength(1)
  })

  it('表不存在时静默跳过', async () => {
    const empty = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    })
    await empty.initialize()
    await expect(addNarrativeBindingFks(empty)).resolves.not.toThrow()
    await empty.destroy()
  })
})
