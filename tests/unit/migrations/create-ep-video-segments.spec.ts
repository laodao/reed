/**
 * migration: create-ep-video-segments 单测（tasks/2026-09-04-ep-video-segment-redesign §4/§7）
 *
 * 旧库（无 ep_video_segments / 无 storyboards.segment_* 列）插数据 → 迁移 → 断言：
 * - 建表 + 索引 + storyboards 加两列（幂等，连跑两次）
 * - 有 video_path 的 storyboard → 单镜 segment（video_path/video_mode/duration/provider 搬过去，
 *   status=completed，segment_id 回填，segment_seq=1）
 * - 无 video_path 的 storyboard → 不动
 * - seq 按 episode 内 场景序+镜头序 连续编号；重跑不重复迁移
 */

import { describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { createEpVideoSegments } from '@core/database/migrations/create-ep-video-segments'

/** 模拟迁移前的旧库：三张表，storyboards 无 segment 列 */
async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  await ds.query(`CREATE TABLE episode_scripts (
    id TEXT PRIMARY KEY, project_id TEXT, episode_id TEXT, outline_id TEXT,
    status TEXT, synopsis TEXT, script_content TEXT, script_format TEXT,
    scenes TEXT, total_duration INTEGER, character_appearances TEXT,
    user_id TEXT, created_at DATETIME, updated_at DATETIME
  )`)
  await ds.query(`CREATE TABLE scene_scripts (
    id TEXT PRIMARY KEY, episode_script_id TEXT, scene_number INTEGER,
    location TEXT, location_binding_id TEXT, location_type TEXT, time_of_day TEXT,
    weather TEXT, scene_description TEXT, mood TEXT, lighting TEXT,
    characters TEXT, original_text TEXT, narration TEXT, dialogues TEXT, actions TEXT,
    user_id TEXT, created_at DATETIME, updated_at DATETIME
  )`)
  await ds.query(`CREATE TABLE storyboards (
    id TEXT PRIMARY KEY, scene_script_id TEXT, shot_number INTEGER,
    shot_type TEXT, camera_angle TEXT, camera_movement TEXT, movement_duration REAL,
    frame_description TEXT, subject TEXT, composition TEXT, characters TEXT,
    narration_id TEXT, dialogue_ids TEXT, action_ids TEXT,
    frame_image TEXT, frame_image_id TEXT, video_path TEXT, duration REAL,
    transition TEXT, transition_type TEXT, transition_duration_ms REAL,
    transition_direction TEXT, transition_easing TEXT, transition_color TEXT,
    status TEXT, keyframe_count INTEGER, video_provider_id TEXT, video_model_id TEXT,
    video_mode TEXT, use_3d_staging INTEGER, staging_layout_id TEXT,
    background_ref_image_id TEXT, user_id TEXT, created_at DATETIME, updated_at DATETIME
  )`)
  return ds
}

async function seedLegacy(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT INTO episode_scripts (id, project_id, episode_id, status) VALUES ('es1', 'vp1', 'ep1', 'completed')`,
  )
  await ds.query(
    `INSERT INTO scene_scripts (id, episode_script_id, scene_number, location) VALUES
       ('sc1', 'es1', 1, '工作室'), ('sc2', 'es1', 2, '巷口')`,
  )
  // sb1：有视频（完整元数据）；sb2：有视频（最小元数据）；sb3：无视频（不动）
  await ds.query(
    `INSERT INTO storyboards
       (id, scene_script_id, shot_number, frame_description, video_path, duration,
        video_mode, video_provider_id, video_model_id, status)
     VALUES
       ('sb1', 'sc1', 1, '修书', '/data/v1.mp4', 5.5, 'image2video', 'pc_dash', 'wanx2.1', 'completed'),
       ('sb2', 'sc2', 1, '巷口', '/data/v2.mp4', 4, NULL, NULL, NULL, 'completed'),
       ('sb3', 'sc2', 2, '路人', NULL, 3, NULL, NULL, NULL, 'pending')`,
  )
}

describe('migration: create-ep-video-segments', () => {
  it('建表 + 加列 + 存量有视频分镜迁成单镜 segment（幂等）', async () => {
    const ds = await buildLegacyDb()
    try {
      await seedLegacy(ds)
      await createEpVideoSegments(ds)
      await createEpVideoSegments(ds) // 幂等：连跑两次

      // 表 + 索引
      const tables = await ds.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='ep_video_segments'`,
      )
      expect(tables).toHaveLength(1)
      const indexes: Array<{ name: string }> = await ds.query(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ep_video_segments'`,
      )
      const idxNames = indexes.map(i => i.name)
      expect(idxNames).toContain('idx_evs_episode')
      expect(idxNames).toContain('idx_evs_scene')

      // storyboards 加列
      const cols: Array<{ name: string }> = await ds.query(`PRAGMA table_info('storyboards')`)
      const colNames = cols.map(c => c.name)
      expect(colNames).toContain('segment_id')
      expect(colNames).toContain('segment_seq')

      // 只迁了 2 个有视频的分镜（跑两次不翻倍）
      const segs = await ds.query(
        `SELECT * FROM ep_video_segments ORDER BY seq`,
      )
      expect(segs).toHaveLength(2)

      expect(segs[0].episode_id).toBe('ep1')
      expect(segs[0].scene_id).toBe('sc1')
      expect(segs[0].seq).toBe(1)
      expect(segs[0].status).toBe('completed')
      expect(segs[0].shot_count).toBe(1)
      expect(segs[0].video_path).toBe('/data/v1.mp4')
      expect(segs[0].video_mode).toBe('image2video')
      expect(segs[0].duration).toBe(5.5)
      expect(segs[0].est_duration).toBe(5.5)
      expect(segs[0].provider_id).toBe('pc_dash')
      expect(segs[0].model_id).toBe('wanx2.1')

      expect(segs[1].scene_id).toBe('sc2')
      expect(segs[1].seq).toBe(2)
      expect(segs[1].video_path).toBe('/data/v2.mp4')

      // backfill：sb1/sb2 回填；sb3（无视频）不动
      const sbs = await ds.query(
        `SELECT id, segment_id, segment_seq FROM storyboards ORDER BY id`,
      )
      expect(sbs[0].segment_id).toBe(segs[0].id)
      expect(sbs[0].segment_seq).toBe(1)
      expect(sbs[1].segment_id).toBe(segs[1].id)
      expect(sbs[1].segment_seq).toBe(1)
      expect(sbs[2].segment_id).toBeNull()
      expect(sbs[2].segment_seq).toBeNull()
    } finally {
      await ds.destroy()
    }
  })

  it('空库（无业务表）不报错', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    })
    await ds.initialize()
    try {
      await createEpVideoSegments(ds)
      const tables = await ds.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='ep_video_segments'`,
      )
      expect(tables).toHaveLength(1)
    } finally {
      await ds.destroy()
    }
  })

  it('迁移后新写 video_path 的单镜（过渡期）下次迁移也会被包成 segment', async () => {
    const ds = await buildLegacyDb()
    try {
      await seedLegacy(ds)
      await createEpVideoSegments(ds)
      // 模拟单镜生成路径又写了 sb3 的 video_path（segment_id 仍 NULL）
      await ds.query(`UPDATE storyboards SET video_path='/data/v3.mp4' WHERE id='sb3'`)
      await createEpVideoSegments(ds)
      const segs = await ds.query(`SELECT * FROM ep_video_segments ORDER BY seq`)
      expect(segs).toHaveLength(3)
      expect(segs[2].video_path).toBe('/data/v3.mp4')
      expect(segs[2].seq).toBe(3) // 续排在存量 max(seq) 之后
    } finally {
      await ds.destroy()
    }
  })
})
