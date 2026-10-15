/**
 * TimelineBuilderService 单测（P6-T1）
 *
 * 覆盖：
 * - 单场景多镜：startSec / endSec 累加 + 首镜 transition=null
 * - 多场景：跨场景时间累加无缝
 * - missingVideoStoryboardIds：缺 videoPath 的分镜 ID 收集
 * - 自定义 transition_type / duration_ms 字段被读出
 * - 空场景集 → 抛错
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { TimelineBuilderService } from '@core/platform/episode-production/compose/timeline-builder.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [SceneScriptEntity, StoryboardEntity, EpVideoSegmentEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedScenesAndShots(
  ds: DataSource,
  data: Array<{
    sceneId: string
    sceneNumber: number
    shots: Array<{
      id: string
      shotNumber: number
      duration: number
      videoPath?: string | null
      transitionType?: string | null
      transitionDurationMs?: number | null
      segmentId?: string | null
    }>
  }>,
  episodeScriptId = 'es1',
): Promise<void> {
  const sceneRepo = ds.getRepository(SceneScriptEntity)
  const sbRepo = ds.getRepository(StoryboardEntity)
  for (const s of data) {
    await sceneRepo.save({
      id: s.sceneId,
      episodeScriptId,
      sceneNumber: s.sceneNumber,
      location: '茶馆',
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
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    for (const shot of s.shots) {
      await sbRepo.save({
        id: shot.id,
        sceneScriptId: s.sceneId,
        shotNumber: shot.shotNumber,
        shotType: 'medium',
        cameraAngle: 'eye_level',
        cameraMovement: 'static',
        movementDuration: null,
        frameDescription: '',
        subject: null,
        composition: null,
        characters: null,
        narrationId: null,
        dialogueIds: [],
        actionIds: [],
        frameImage: null,
        frameImageId: null,
        videoPath: shot.videoPath ?? null,
        segmentId: shot.segmentId ?? null,
        segmentSeq: null,
        duration: shot.duration,
        transition: '{}',
        transitionType: shot.transitionType ?? null,
        transitionDurationMs: shot.transitionDurationMs ?? null,
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
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
    }
  }
}

describe('TimelineBuilderService', () => {
  let ds: DataSource
  let svc: TimelineBuilderService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new TimelineBuilderService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('单场景 3 镜：start/end 累加，首镜 transition=null', async () => {
    await seedScenesAndShots(ds, [
      {
        sceneId: 's1',
        sceneNumber: 1,
        shots: [
          { id: 'sb1', shotNumber: 1, duration: 3, videoPath: '/tmp/1.mp4' },
          { id: 'sb2', shotNumber: 2, duration: 4, videoPath: '/tmp/2.mp4' },
          { id: 'sb3', shotNumber: 3, duration: 2, videoPath: '/tmp/3.mp4' },
        ],
      },
    ])

    const tl = await svc.buildEpisodeTimeline('es1')
    expect(tl.totalDurationSec).toBe(9)
    expect(tl.scenes).toHaveLength(1)
    expect(tl.scenes[0].shots).toHaveLength(3)

    const shots = tl.scenes[0].shots
    expect(shots[0].startSec).toBe(0)
    expect(shots[0].endSec).toBe(3)
    expect(shots[0].transition).toBeNull() // 首镜
    expect(shots[1].startSec).toBe(3)
    expect(shots[1].endSec).toBe(7)
    expect(shots[1].transition).not.toBeNull()
    expect(shots[2].startSec).toBe(7)
    expect(shots[2].endSec).toBe(9)

    expect(tl.missingVideoStoryboardIds).toEqual([])
  })

  it('多场景：时间跨场景累加无缝', async () => {
    await seedScenesAndShots(ds, [
      {
        sceneId: 's1',
        sceneNumber: 1,
        shots: [{ id: 'sb1', shotNumber: 1, duration: 3, videoPath: '/v1.mp4' }],
      },
      {
        sceneId: 's2',
        sceneNumber: 2,
        shots: [
          { id: 'sb2', shotNumber: 1, duration: 4, videoPath: '/v2.mp4' },
          { id: 'sb3', shotNumber: 2, duration: 2, videoPath: '/v3.mp4' },
        ],
      },
    ])

    const tl = await svc.buildEpisodeTimeline('es1')
    expect(tl.totalDurationSec).toBe(9)
    expect(tl.scenes).toHaveLength(2)
    expect(tl.scenes[0].endSec).toBe(3)
    expect(tl.scenes[1].startSec).toBe(3)
    expect(tl.scenes[1].endSec).toBe(9)
    // 第二场景首镜（跨场景）也应该是 null transition
    expect(tl.scenes[1].shots[0].transition).toBeNull()
  })

  it('missingVideoStoryboardIds：缺 videoPath 的分镜被收集', async () => {
    await seedScenesAndShots(ds, [
      {
        sceneId: 's1',
        sceneNumber: 1,
        shots: [
          { id: 'sb_ok', shotNumber: 1, duration: 3, videoPath: '/v1.mp4' },
          { id: 'sb_bad', shotNumber: 2, duration: 4, videoPath: null },
          { id: 'sb_ok2', shotNumber: 3, duration: 2, videoPath: '/v3.mp4' },
        ],
      },
    ])
    const tl = await svc.buildEpisodeTimeline('es1')
    expect(tl.missingVideoStoryboardIds).toEqual(['sb_bad'])
    expect(tl.totalDurationSec).toBe(9) // 仍累加（duration 占位）
  })

  it('视频片段制：分镜无 videoPath 但所属片段已出片 → 不算缺失', async () => {
    await seedScenesAndShots(ds, [
      {
        sceneId: 's1',
        sceneNumber: 1,
        shots: [
          // 同一片段的两镜：shot 级无视频，片段级有视频
          { id: 'sb1', shotNumber: 1, duration: 5, videoPath: null, segmentId: 'seg1' },
          { id: 'sb2', shotNumber: 2, duration: 7, videoPath: null, segmentId: 'seg1' },
          // 片段存在但未出片 → 仍缺失
          { id: 'sb3', shotNumber: 3, duration: 4, videoPath: null, segmentId: 'seg2' },
        ],
      },
    ])
    const segRepo = ds.getRepository(EpVideoSegmentEntity)
    const now = new Date()
    await segRepo.save([
      { id: 'seg1', episodeId: 've1', sceneId: 's1', seq: 1, status: 'completed', shotCount: 2, videoPath: 'video-segments/seg1.mp4', createdAt: now, updatedAt: now },
      { id: 'seg2', episodeId: 've1', sceneId: 's1', seq: 2, status: 'pending', shotCount: 1, videoPath: null, createdAt: now, updatedAt: now },
    ] as any)

    const tl = await svc.buildEpisodeTimeline('es1')
    expect(tl.missingVideoStoryboardIds).toEqual(['sb3'])
  })

  it('视频片段制：所属片段 superseded 后分镜回退为缺失（与导出器口径对齐）', async () => {
    await seedScenesAndShots(ds, [
      {
        sceneId: 's1',
        sceneNumber: 1,
        shots: [
          { id: 'sb1', shotNumber: 1, duration: 5, videoPath: null, segmentId: 'seg1' },
          { id: 'sb2', shotNumber: 2, duration: 7, videoPath: null, segmentId: 'seg2' },
        ],
      },
    ])
    const segRepo = ds.getRepository(EpVideoSegmentEntity)
    const now = new Date()
    await segRepo.save([
      // superseded 片段即使有 videoPath 也不算出片（导出会跳过）
      { id: 'seg1', episodeId: 've1', sceneId: 's1', seq: 1, status: 'superseded', shotCount: 1, videoPath: 'video-segments/seg1.mp4', createdAt: now, updatedAt: now },
      { id: 'seg2', episodeId: 've1', sceneId: 's1', seq: 2, status: 'completed', shotCount: 1, videoPath: 'video-segments/seg2.mp4', createdAt: now, updatedAt: now },
    ] as any)

    const tl = await svc.buildEpisodeTimeline('es1')
    expect(tl.missingVideoStoryboardIds).toEqual(['sb1'])
  })

  it('自定义 transition_type + duration 被正确读出', async () => {
    await seedScenesAndShots(ds, [
      {
        sceneId: 's1',
        sceneNumber: 1,
        shots: [
          { id: 'sb1', shotNumber: 1, duration: 3, videoPath: '/v1.mp4' },
          {
            id: 'sb2',
            shotNumber: 2,
            duration: 3,
            videoPath: '/v2.mp4',
            transitionType: 'dissolve',
            transitionDurationMs: 800,
          },
        ],
      },
    ])
    const tl = await svc.buildEpisodeTimeline('es1')
    const t = tl.scenes[0].shots[1].transition
    expect(t?.type).toBe('dissolve')
    expect(t?.duration).toBe(800)
  })

  it('episode 不存在场景 → 抛错', async () => {
    await expect(svc.buildEpisodeTimeline('es_ghost')).rejects.toThrow(
      /没有任何场景/,
    )
  })
})
