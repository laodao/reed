import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { createStoryboardKeyframe } from '@core/database/migrations/create-storyboard-keyframe'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [], synchronize: false })
  await ds.initialize()
  await ds.query(`CREATE TABLE storyboards (
    id TEXT PRIMARY KEY,
    scene_script_id TEXT,
    shot_number INTEGER,
    frame_image_id TEXT,
    duration REAL
  )`)
  return ds
}

describe('createStoryboardKeyframe migration', () => {
  it('建 storyboard_keyframe 表 + 给 storyboard 加多模式字段', async () => {
    const ds = await buildLegacyDb()
    await createStoryboardKeyframe(ds)

    const kfCols = (await ds.query(`SELECT name FROM pragma_table_info('storyboard_keyframe')`))
      .map((r: any) => r.name)
    expect(kfCols).toEqual(expect.arrayContaining([
      'id', 'storyboard_id', 'frame_index', 'time_percent', 'frame_role',
      'image_asset_id', 'prompt',
    ]))

    const sbCols = (await ds.query(`SELECT name FROM pragma_table_info('storyboards')`))
      .map((r: any) => r.name)
    expect(sbCols).toEqual(expect.arrayContaining([
      'keyframe_count', 'video_provider_id', 'video_model_id', 'video_mode',
      'use_3d_staging', 'staging_layout_id',
    ]))

    await ds.destroy()
  })

  it('搬 storyboard.frame_image_id 为 keyframe 行（frame_index=0, frame_role=start）', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO storyboards (id, frame_image_id) VALUES
      ('sb1', 'img_a'),
      ('sb2', 'img_b'),
      ('sb3', NULL)`)
    await createStoryboardKeyframe(ds)
    const rows = await ds.query(
      `SELECT storyboard_id, frame_index, frame_role, image_asset_id FROM storyboard_keyframe ORDER BY storyboard_id`,
    )
    expect(rows).toEqual([
      { storyboard_id: 'sb1', frame_index: 0, frame_role: 'start', image_asset_id: 'img_a' },
      { storyboard_id: 'sb2', frame_index: 0, frame_role: 'start', image_asset_id: 'img_b' },
    ])
    await ds.destroy()
  })

  it('幂等：第二次跑不重复插入', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO storyboards (id, frame_image_id) VALUES ('sb1', 'img_a')`)
    await createStoryboardKeyframe(ds)
    await createStoryboardKeyframe(ds)
    const c = (await ds.query(`SELECT count(*) as c FROM storyboard_keyframe`))[0].c
    expect(c).toBe(1)
    await ds.destroy()
  })
})
