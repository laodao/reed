import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { addStoryboardBackgroundRef } from '@core/database/migrations/add-storyboard-background-ref'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  await ds.query(`CREATE TABLE storyboards (
    id TEXT PRIMARY KEY,
    scene_script_id TEXT,
    shot_number INTEGER
  )`)
  return ds
}

async function buildEmptyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  return ds
}

describe('addStoryboardBackgroundRef migration', () => {
  it('给已有 storyboards 表加 background_ref_image_id 列', async () => {
    const ds = await buildLegacyDb()
    await addStoryboardBackgroundRef(ds)
    const cols = (
      await ds.query(`SELECT name FROM pragma_table_info('storyboards')`)
    ).map((r: any) => r.name)
    expect(cols).toContain('background_ref_image_id')
    await ds.destroy()
  })

  it('幂等：第二次跑不报错', async () => {
    const ds = await buildLegacyDb()
    await addStoryboardBackgroundRef(ds)
    await expect(addStoryboardBackgroundRef(ds)).resolves.not.toThrow()
    const cols = (
      await ds.query(`SELECT name FROM pragma_table_info('storyboards')`)
    ).map((r: any) => r.name)
    // 列只应出现一次
    expect(cols.filter((c: string) => c === 'background_ref_image_id').length).toBe(1)
    await ds.destroy()
  })

  it('storyboards 表不存在时跳过、不报错', async () => {
    const ds = await buildEmptyDb()
    await expect(addStoryboardBackgroundRef(ds)).resolves.not.toThrow()
    await ds.destroy()
  })
})
