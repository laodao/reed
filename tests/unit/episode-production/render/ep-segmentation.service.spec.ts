/**
 * EpSegmentationService 单测（tasks/2026-09-04-ep-video-segment-redesign §3）
 *
 * in-memory sqlite + 真 repository 验证：
 * - 基本拆分：场景边界必切 + 预算切分 + backfill（segment_id/segment_seq）
 * - 项目级预算（video_projects.config.segmentDurationBudgetSec）优先生效
 * - 幂等重算：重跑不产生重复 segment，backfill 一致
 * - 已 completed 的 segment 及其分镜不动，其余重排（seq 续排）
 * - 无剧本 → 抛错
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { EpSegmentationService } from '@core/modules/episode-production/render/video/ep-segmentation.service'
import { EpVideoSegmentRepository } from '@core/database/repositories/video-segment.repository'
import { StoryboardRepository } from '@core/database/repositories/storyboard.repository'

const ENTITIES = [
  VideoProjectEntity,
  VideoEpisodeEntity,
  EpisodeScriptEntity,
  SceneScriptEntity,
  StoryboardEntity,
  EpVideoSegmentEntity,
]

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: ENTITIES,
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

/** 种一集一剧本；sceneDurations[i] = 第 i+1 个场景的镜头时长列表 */
async function seedEpisode(
  ds: DataSource,
  sceneDurations: number[][],
  opts: { budgetSec?: number } = {},
): Promise<void> {
  const now = new Date()
  await ds.getRepository(VideoProjectEntity).save({
    id: 'vp1',
    name: 'demo',
    status: 'draft',
    config:
      opts.budgetSec != null
        ? { segmentDurationBudgetSec: opts.budgetSec }
        : {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as any)
  await ds.getRepository(VideoEpisodeEntity).save({
    id: 'ep1',
    projectId: 'vp1',
    episodeNumber: 1,
    title: '第1集',
    status: 'storyboarding',
    duration: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as any)
  await ds.getRepository(EpisodeScriptEntity).save({
    id: 'es1',
    projectId: 'vp1',
    episodeId: 'ep1',
    outlineId: null,
    status: 'completed',
    synopsis: null,
    scriptContent: null,
    scriptFormat: 'standard',
    scenes: null,
    totalDuration: 0,
    characterAppearances: null,
    createdAt: now,
    updatedAt: now,
  } as any)

  for (let s = 0; s < sceneDurations.length; s++) {
    const sceneId = `sc${s + 1}`
    await ds.getRepository(SceneScriptEntity).save({
      id: sceneId,
      episodeScriptId: 'es1',
      sceneNumber: s + 1,
      location: `场景${s + 1}`,
      locationBindingId: null,
      locationType: 'interior',
      timeOfDay: 'morning',
      weather: null,
      sceneDescription: '',
      mood: null,
      lighting: null,
      characters: null,
      originalText: null,
      narration: null,
      dialogues: null,
      actions: null,
      createdAt: now,
      updatedAt: now,
    } as any)
    const durs = sceneDurations[s]
    for (let i = 0; i < durs.length; i++) {
      await ds.getRepository(StoryboardEntity).save({
        id: `sb_${sceneId}_${i + 1}`,
        sceneScriptId: sceneId,
        shotNumber: i + 1,
        shotType: 'medium',
        cameraAngle: 'eye_level',
        cameraMovement: 'static',
        movementDuration: null,
        frameDescription: `画面${s + 1}-${i + 1}`,
        subject: null,
        composition: null,
        characters: null,
        narrationId: null,
        dialogueIds: [],
        actionIds: [],
        frameImage: null,
        frameImageId: null,
        videoPath: null,
        duration: durs[i],
        transition: '{}',
        transitionType: null,
        transitionDurationMs: null,
        transitionDirection: null,
        transitionEasing: null,
        transitionColor: null,
        status: 'pending',
        keyframeCount: 2,
        videoProviderId: null,
        videoModelId: null,
        videoMode: null,
        use3dStaging: 0,
        stagingLayoutId: null,
        backgroundRefImageId: null,
        createdAt: now,
        updatedAt: now,
      } as any)
    }
  }
}

describe('EpSegmentationService', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('基本拆分：场景边界必切 + 预算切分 + backfill', async () => {
    // 场景1：4 镜 ×5s，预算 15 → 3+1 两段；场景2：2 镜 → 一段（不跨场景合并）
    await seedEpisode(ds, [[5, 5, 5, 5], [4, 4]])
    const svc = new EpSegmentationService(ds)
    const preview = await svc.recompute('ep1')

    expect(preview.budgetSec).toBe(15)
    expect(preview.sceneCount).toBe(2)
    expect(preview.totalShotCount).toBe(6)
    expect(preview.segments).toHaveLength(3)
    expect(preview.segments.map(s => s.seq)).toEqual([1, 2, 3])
    expect(preview.segments.map(s => s.shotCount)).toEqual([3, 1, 2])
    expect(preview.segments.map(s => s.estDuration)).toEqual([15, 5, 8])
    expect(preview.segments.every(s => s.status === 'pending')).toBe(true)
    // 场景边界：段 3 属场景 2（即使场景1 段2 只有 5s 也不跨场景并段）
    expect(preview.segments[2].sceneId).toBe('sc2')

    // backfill：段内 segment_seq 连续 1-based
    const sbRepo = new StoryboardRepository(ds)
    const seg1Shots = await sbRepo.getBySegmentId(preview.segments[0].segmentId)
    expect(seg1Shots.map(s => s.id)).toEqual(['sb_sc1_1', 'sb_sc1_2', 'sb_sc1_3'])
    expect(seg1Shots.map(s => s.segmentSeq)).toEqual([1, 2, 3])
  })

  it('项目级预算优先生效（config.segmentDurationBudgetSec=10 → 2+2）', async () => {
    await seedEpisode(ds, [[5, 5, 5, 5]], { budgetSec: 10 })
    const svc = new EpSegmentationService(ds)
    const preview = await svc.recompute('ep1')

    expect(preview.budgetSec).toBe(10)
    expect(preview.segments.map(s => s.shotCount)).toEqual([2, 2])
  })

  it('调用方 opts.budgetSec 覆盖项目配置', async () => {
    await seedEpisode(ds, [[5, 5, 5, 5]], { budgetSec: 10 })
    const svc = new EpSegmentationService(ds)
    const preview = await svc.recompute('ep1', { budgetSec: 30 })
    expect(preview.segments).toHaveLength(1)
  })

  it('幂等重算：重跑 segment 数不变、无重复 backfill', async () => {
    await seedEpisode(ds, [[5, 5, 5, 5], [4, 4]])
    const svc = new EpSegmentationService(ds)
    await svc.recompute('ep1')
    const second = await svc.recompute('ep1')

    const segRepo = new EpVideoSegmentRepository(ds)
    const all = await segRepo.listByEpisode('ep1')
    expect(all).toHaveLength(3)
    expect(second.segments.map(s => s.shotCount)).toEqual([3, 1, 2])
    // 每个分镜恰好归属一个段
    const sbRepo = new StoryboardRepository(ds)
    for (let i = 1; i <= 4; i++) {
      const sb = await sbRepo.getById(`sb_sc1_${i}`)
      expect(sb?.segmentId).toBeTruthy()
      expect(sb?.segmentSeq).toBeGreaterThan(0)
    }
  })

  it('已 completed 的 segment 及其分镜不动；其余重排、seq 续排', async () => {
    await seedEpisode(ds, [[5, 5, 5, 5]])
    const svc = new EpSegmentationService(ds)
    const first = await svc.recompute('ep1') // 段1(3镜15s) 段2(1镜5s)
    const completedSegId = first.segments[0].segmentId

    // 段1 标记 completed（模拟已生成）
    const segRepo = new EpVideoSegmentRepository(ds)
    await segRepo.update(completedSegId, {
      status: 'completed',
      videoPath: '/tmp/seg1.mp4',
    })

    // 改预算重算：段1 不动，剩余 1 镜按新预算重排
    const second = await svc.recompute('ep1', { budgetSec: 5 })
    const segs = second.segments
    const kept = segs.find(s => s.segmentId === completedSegId)
    expect(kept).toBeTruthy()
    expect(kept!.status).toBe('completed')
    expect(kept!.shotCount).toBe(3)
    expect(kept!.storyboardIds).toEqual(['sb_sc1_1', 'sb_sc1_2', 'sb_sc1_3'])

    // 段2 被删重建（新 id），seq 续排在 max 之后
    const rebuilt = segs.filter(s => s.segmentId !== completedSegId)
    expect(rebuilt).toHaveLength(1)
    expect(rebuilt[0].storyboardIds).toEqual(['sb_sc1_4'])
    expect(rebuilt[0].seq).toBeGreaterThan(kept!.seq)

    const sbRepo = new StoryboardRepository(ds)
    const sb4 = await sbRepo.getById('sb_sc1_4')
    expect(sb4?.segmentId).toBe(rebuilt[0].segmentId)
  })

  it('preview 不重算，只读当前分段', async () => {
    await seedEpisode(ds, [[5, 5]])
    const svc = new EpSegmentationService(ds)
    const before = await svc.preview('ep1')
    expect(before.segments).toHaveLength(0)
    await svc.recompute('ep1')
    const after = await svc.preview('ep1')
    expect(after.segments).toHaveLength(1)
    expect(after.segments[0].shotCount).toBe(2)
  })

  it('无剧本 → 抛错', async () => {
    const svc = new EpSegmentationService(ds)
    await expect(svc.recompute('ep_ghost')).rejects.toThrow(/还没有剧本/)
  })
})
