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
import { EpSegmentationService } from '@core/platform/episode-production/render/video/ep-segmentation.service'
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

  // ─── S-03 手动分段（mergeSegments / splitSegment） ───

  it('mergeSegments：相邻同场景段合并 → shot 续接 + seq 重排 + prompt 重算', async () => {
    // 场景1：3 镜 ×4s，预算 8 → 段1（2 镜 8s）+ 段2（1 镜 4s）
    await seedEpisode(ds, [[4, 4, 4]], { budgetSec: 8 })
    const svc = new EpSegmentationService(ds)
    const first = await svc.recompute('ep1')
    expect(first.segments).toHaveLength(2)

    const merged = await svc.mergeSegments(
      first.segments[0].segmentId,
      first.segments[1].segmentId,
    )
    expect(merged.segments).toHaveLength(1)
    const seg = merged.segments[0]
    expect(seg.seq).toBe(1)
    expect(seg.shotCount).toBe(3)
    expect(seg.estDuration).toBe(12)
    expect(seg.status).toBe('pending')
    expect(seg.videoPath).toBeNull()
    expect(seg.storyboardIds).toEqual(['sb_sc1_1', 'sb_sc1_2', 'sb_sc1_3'])

    // prompt 按合并后全部镜头重算
    const segRepo = new EpVideoSegmentRepository(ds)
    const row = await segRepo.getById(seg.segmentId)
    expect(row?.prompt).toContain('镜头1')
    expect(row?.prompt).toContain('镜头3')
    expect(row?.prompt).toContain('画面1-3')

    // 段内 segment_seq 连续
    const sbRepo = new StoryboardRepository(ds)
    const shots = await sbRepo.getBySegmentId(seg.segmentId)
    expect(shots.map(s => s.segmentSeq)).toEqual([1, 2, 3])
  })

  it('mergeSegments：校验——跨场景 / 不相邻 / 超 15s / generating 均拒绝', async () => {
    await seedEpisode(ds, [[4, 4, 4, 4, 4, 4], [4, 4]], { budgetSec: 8 })
    const svc = new EpSegmentationService(ds)
    const preview = await svc.recompute('ep1')
    // 场景1：段1(2镜8s) 段2(2镜8s) 段3(2镜8s)；场景2：段4(2镜8s)
    expect(preview.segments.map(s => s.shotCount)).toEqual([2, 2, 2, 2])
    const [s1, s2, s3, s4] = preview.segments

    // 跨场景
    await expect(svc.mergeSegments(s3.segmentId, s4.segmentId)).rejects.toThrow(/同一场景/)
    // 不相邻（seq 差 2）
    await expect(svc.mergeSegments(s1.segmentId, s3.segmentId)).rejects.toThrow(/相邻/)
    // 合计 > 15s（8+8=16）
    await expect(svc.mergeSegments(s1.segmentId, s2.segmentId)).rejects.toThrow(/超过/)

    // generating 拒绝
    const segRepo = new EpVideoSegmentRepository(ds)
    await segRepo.update(s2.segmentId, { status: 'generating' })
    await expect(svc.mergeSegments(s2.segmentId, s3.segmentId)).rejects.toThrow(/生成中/)
  })

  it('splitSegment：断点镜后另起一段 → seq 重排 + prompt 重算；再合并可还原', async () => {
    // 场景1：3 镜 ×4s，预算 15 → 单段 3 镜
    await seedEpisode(ds, [[4, 4, 4]])
    const svc = new EpSegmentationService(ds)
    const first = await svc.recompute('ep1')
    expect(first.segments).toHaveLength(1)
    const seg = first.segments[0]

    const split = await svc.splitSegment(seg.segmentId, 'sb_sc1_1')
    expect(split.segments).toHaveLength(2)
    expect(split.segments.map(s => s.seq)).toEqual([1, 2])
    expect(split.segments.map(s => s.shotCount)).toEqual([1, 2])
    expect(split.segments.map(s => s.estDuration)).toEqual([4, 8])
    // 头段保留原 segment id
    expect(split.segments[0].segmentId).toBe(seg.segmentId)
    expect(split.segments[0].storyboardIds).toEqual(['sb_sc1_1'])
    expect(split.segments[1].storyboardIds).toEqual(['sb_sc1_2', 'sb_sc1_3'])

    // prompt 各自重算
    const segRepo = new EpVideoSegmentRepository(ds)
    const head = await segRepo.getById(split.segments[0].segmentId)
    const tail = await segRepo.getById(split.segments[1].segmentId)
    expect(head?.prompt).toContain('画面1-1')
    expect(head?.prompt).not.toContain('画面1-2')
    expect(tail?.prompt).toContain('画面1-2')
    expect(tail?.prompt).toContain('画面1-3')

    // 再合并回来（4+8=12 ≤ 15）→ 段数恢复
    const remerged = await svc.mergeSegments(
      split.segments[0].segmentId,
      split.segments[1].segmentId,
    )
    expect(remerged.segments).toHaveLength(1)
    expect(remerged.segments[0].shotCount).toBe(3)
  })

  it('splitSegment：校验——不足 2 镜 / 断点为最后一镜 / 断点不属于该段 / generating', async () => {
    await seedEpisode(ds, [[4, 4], [10]], { budgetSec: 15 })
    const svc = new EpSegmentationService(ds)
    const preview = await svc.recompute('ep1')
    const [segA, segB] = preview.segments // segA 2 镜；segB 单镜

    // 单镜段不可拆
    await expect(svc.splitSegment(segB.segmentId, 'sb_sc2_1')).rejects.toThrow(/不足 2 镜/)
    // 断点为最后一镜
    await expect(svc.splitSegment(segA.segmentId, 'sb_sc1_2')).rejects.toThrow(/最后一镜/)
    // 断点不属于该段
    await expect(svc.splitSegment(segA.segmentId, 'sb_sc2_1')).rejects.toThrow(/不属于/)

    const segRepo = new EpVideoSegmentRepository(ds)
    await segRepo.update(segA.segmentId, { status: 'generating' })
    await expect(svc.splitSegment(segA.segmentId, 'sb_sc1_1')).rejects.toThrow(/生成中/)
  })
})
