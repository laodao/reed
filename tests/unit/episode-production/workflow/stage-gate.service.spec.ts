/**
 * StageGateService 单测（2026-09-25 一致性修复 · 审计主题 B）
 *
 * 覆盖 ⑤ 制作完成判定 + completed 末端硬锁的双口径：
 * - 分镜无 videoPath 但所属片段 completed+videoPath → producing 完成，可进 completed（canForce=false）
 * - 所属片段置 superseded 后 → 判定回退为未完成，completed 硬锁拦截
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { StageGateService } from '@core/platform/episode-production/workflow/stage-gate.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      VideoEpisodeEntity,
      EpisodeScriptEntity,
      SceneScriptEntity,
      StoryboardEntity,
      AssetImageEntity,
      EpVideoSegmentEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedBase(ds: DataSource): Promise<void> {
  const now = new Date()
  await ds.getRepository(VideoEpisodeEntity).save({
    id: 've1', projectId: 'p1', episodeNumber: 1, title: '第 1 集', status: 'producing',
    duration: 0, createdAt: now, updatedAt: now,
  } as any)
  await ds.getRepository(EpisodeScriptEntity).save({
    id: 'es1', projectId: 'p1', episodeId: 've1', status: 'approved', createdAt: now, updatedAt: now,
  } as any)
  await ds.getRepository(SceneScriptEntity).save({
    id: 's1', episodeScriptId: 'es1', sceneNumber: 1, location: '茶馆',
    locationBindingId: null, locationType: 'interior', timeOfDay: 'morning',
    weather: null, sceneDescription: '', mood: null, lighting: null,
    characters: null, originalText: null, narration: null, dialogues: null, actions: null,
    createdAt: now, updatedAt: now,
  } as any)
}

async function seedShot(
  ds: DataSource,
  shot: { id: string; shotNumber: number; videoPath?: string | null; segmentId?: string | null },
): Promise<void> {
  const now = new Date()
  await ds.getRepository(StoryboardEntity).save({
    id: shot.id,
    sceneScriptId: 's1',
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
    duration: 4,
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

async function seedSegment(
  ds: DataSource,
  seg: { id: string; status: string; videoPath?: string | null },
): Promise<void> {
  const now = new Date()
  await ds.getRepository(EpVideoSegmentEntity).save({
    id: seg.id,
    episodeId: 've1',
    sceneId: 's1',
    seq: 1,
    status: seg.status,
    shotCount: 2,
    videoPath: seg.videoPath ?? null,
    createdAt: now,
    updatedAt: now,
  } as any)
}

describe('StageGateService · ⑤ 制作双口径', () => {
  let ds: DataSource
  let svc: StageGateService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new StageGateService(ds)
    await seedBase(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('片段制出片：分镜无 videoPath 但片段 completed+videoPath → producing 完成，可进 completed', async () => {
    await seedShot(ds, { id: 'sb1', shotNumber: 1, segmentId: 'seg1' })
    await seedShot(ds, { id: 'sb2', shotNumber: 2, segmentId: 'seg1' })
    await seedSegment(ds, { id: 'seg1', status: 'completed', videoPath: 'video-segments/seg1.mp4' })

    const completion = await svc.checkStageComplete('ve1', 'producing')
    expect(completion.complete).toBe(true)
    expect(completion.gaps).toEqual([])

    const decision = await svc.canEnterStage('ve1', 'producing', 'completed')
    expect(decision.allowed).toBe(true)
    expect(decision.canForce).toBe(false)
  })

  it('片段 superseded 后 → producing 回退为未完成，completed 硬锁拦截', async () => {
    await seedShot(ds, { id: 'sb1', shotNumber: 1, segmentId: 'seg1' })
    await seedShot(ds, { id: 'sb2', shotNumber: 2, segmentId: 'seg1' })
    await seedSegment(ds, { id: 'seg1', status: 'completed', videoPath: 'video-segments/seg1.mp4' })
    await ds.getRepository(EpVideoSegmentEntity).update({ id: 'seg1' } as any, {
      status: 'superseded',
    } as any)

    const completion = await svc.checkStageComplete('ve1', 'producing')
    expect(completion.complete).toBe(false)
    expect(completion.gaps).toHaveLength(2)
    expect(completion.gaps.every((g) => g.code === 'SHOT_VIDEO_MISSING')).toBe(true)

    const decision = await svc.canEnterStage('ve1', 'producing', 'completed')
    expect(decision.allowed).toBe(false)
    expect(decision.canForce).toBe(false)
  })

  it('混合口径：分镜自身 videoPath 或片段 completed 均算有视频；片段 pending 不算', async () => {
    await seedShot(ds, { id: 'sb1', shotNumber: 1, videoPath: '/v1.mp4' })
    await seedShot(ds, { id: 'sb2', shotNumber: 2, segmentId: 'seg1' })
    await seedShot(ds, { id: 'sb3', shotNumber: 3, segmentId: 'seg2' })
    await seedSegment(ds, { id: 'seg1', status: 'completed', videoPath: 'video-segments/seg1.mp4' })
    await ds.getRepository(EpVideoSegmentEntity).save({
      id: 'seg2', episodeId: 've1', sceneId: 's1', seq: 2, status: 'pending',
      shotCount: 1, videoPath: null, createdAt: new Date(), updatedAt: new Date(),
    } as any)

    const completion = await svc.checkStageComplete('ve1', 'producing')
    expect(completion.complete).toBe(false)
    expect(completion.gaps).toHaveLength(1)
    expect(completion.gaps[0].targetId).toBe('sb3')
  })
})
