/**
 * EpisodeReadinessService 单测（2026-09-19 批1 · evalCompose 双源口径；2026-09-24 审计 X1）
 *
 * 覆盖 compose 阶段与 timeline-builder 同口径的判定：
 * - 分镜自身 videoPath 即算有视频（未入段老数据）
 * - 分镜无 videoPath 但所属片段 completed 且有 videoPath → 有视频
 * - 所属片段 pending / completed 缺 videoPath → 报缺失（同片段多镜只报一次）
 * - 无分镜无片段 → 尚无分镜/片段
 * - 未入段 / 片段 superseded → 只看分镜自身 videoPath
 *
 * 审计 X1（readiness / stage-gate 口径统一）：
 * - 占位行（is_main=1 空 imagePath）不算主图就绪
 * - 未出场资产缺主图不阻塞 assets tab
 * - 场景无分镜 → storyboard tab 判缺（与 gate 同口径）
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { EpisodeReadinessService } from '@core/platform/episode-production/services/readiness.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      VideoEpisodeEntity,
      EpisodeScriptEntity,
      SceneScriptEntity,
      StoryboardEntity,
      CharacterBindingEntity,
      LocationBindingEntity,
      ItemBindingEntity,
      AssetImageEntity,
      EpVideoSegmentEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

/** 基础链：episode + script + 一个场景（compose 只关心 storyboards/segments，其余从简） */
async function seedBase(ds: DataSource): Promise<void> {
  const now = new Date()
  await ds.getRepository(VideoEpisodeEntity).save({
    id: 've1', projectId: 'p1', episodeNumber: 1, title: '第 1 集', status: 'producing',
    duration: 0, createdAt: now, updatedAt: now,
  } as any)
  await ds.getRepository(EpisodeScriptEntity).save({
    id: 'es1', projectId: 'p1', episodeId: 've1', createdAt: now, updatedAt: now,
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
  seg: { id: string; seq: number; status: string; videoPath?: string | null },
): Promise<void> {
  const now = new Date()
  await ds.getRepository(EpVideoSegmentEntity).save({
    id: seg.id, episodeId: 've1', sceneId: 's1', seq: seg.seq, status: seg.status,
    shotCount: 2, videoPath: seg.videoPath ?? null, createdAt: now, updatedAt: now,
  } as any)
}

describe('EpisodeReadinessService · compose 双源口径', () => {
  let ds: DataSource
  let svc: EpisodeReadinessService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new EpisodeReadinessService(ds)
    await seedBase(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('分镜自身有 videoPath（未入段老数据）→ 就绪', async () => {
    await seedShot(ds, { id: 'sb1', shotNumber: 1, videoPath: '/v1.mp4' })
    const r = await svc.evaluateEpisode('ve1')
    expect(r.compose.ready).toBe(true)
    expect(r.compose.missing).toEqual([])
  })

  it('分镜无 videoPath 但所属片段 completed 且有 videoPath → 就绪', async () => {
    await seedShot(ds, { id: 'sb1', shotNumber: 1, segmentId: 'seg1' })
    await seedShot(ds, { id: 'sb2', shotNumber: 2, segmentId: 'seg1' })
    await seedSegment(ds, { id: 'seg1', seq: 1, status: 'completed', videoPath: 'video-segments/seg1.mp4' })
    const r = await svc.evaluateEpisode('ve1')
    expect(r.compose.ready).toBe(true)
  })

  it('所属片段 pending → 未就绪；同片段多镜只报一次', async () => {
    await seedShot(ds, { id: 'sb1', shotNumber: 1, segmentId: 'seg1' })
    await seedShot(ds, { id: 'sb2', shotNumber: 2, segmentId: 'seg1' })
    await seedSegment(ds, { id: 'seg1', seq: 1, status: 'pending' })
    const r = await svc.evaluateEpisode('ve1')
    expect(r.compose.ready).toBe(false)
    expect(r.compose.missing).toEqual(['片段 1 未完成生成（当前状态：pending）'])
  })

  it('片段 completed 但缺 videoPath → 报缺少视频文件', async () => {
    await seedShot(ds, { id: 'sb1', shotNumber: 1, segmentId: 'seg1' })
    await seedSegment(ds, { id: 'seg1', seq: 1, status: 'completed', videoPath: null })
    const r = await svc.evaluateEpisode('ve1')
    expect(r.compose.ready).toBe(false)
    expect(r.compose.missing).toEqual(['片段 1 缺少视频文件'])
  })

  it('无分镜且无片段 → 尚无分镜/片段', async () => {
    const r = await svc.evaluateEpisode('ve1')
    expect(r.compose.ready).toBe(false)
    expect(r.compose.missing).toEqual(['尚无分镜/片段（请先在「分镜」页生成分镜并生成片段视频）'])
  })

  it('未入段且分镜无 videoPath → 报未入片段', async () => {
    await seedShot(ds, { id: 'sb1', shotNumber: 3 })
    const r = await svc.evaluateEpisode('ve1')
    expect(r.compose.ready).toBe(false)
    expect(r.compose.missing).toEqual(['镜头 3 尚无视频（未入片段或片段已废弃）'])
  })

  it('所属片段 superseded → 不看片段视频，只看分镜自身 videoPath', async () => {
    await seedShot(ds, { id: 'sb1', shotNumber: 1, segmentId: 'seg1' })
    await seedSegment(ds, { id: 'seg1', seq: 1, status: 'superseded', videoPath: 'video-segments/old.mp4' })
    const r = await svc.evaluateEpisode('ve1')
    expect(r.compose.ready).toBe(false)
    expect(r.compose.missing).toEqual(['镜头 1 尚无视频（未入片段或片段已废弃）'])
  })

  it('无分镜但有 active 片段（兼容旧剧集）→ 回退片段级检查', async () => {
    await seedSegment(ds, { id: 'seg1', seq: 1, status: 'completed', videoPath: 'video-segments/seg1.mp4' })
    const r = await svc.evaluateEpisode('ve1')
    expect(r.compose.ready).toBe(true)
  })
})

/** 让场景 s1 出场指定角色 binding（characters[].characterBindingId） */
async function seedSceneCharacter(ds: DataSource, characterBindingId: string): Promise<void> {
  await ds.getRepository(SceneScriptEntity).save({
    id: 's1',
    characters: [{ characterBindingId, characterId: `lw-${characterBindingId}`, characterName: '阿甲' }],
  } as any)
}

async function seedCharBinding(
  ds: DataSource,
  b: { id: string; name?: string },
): Promise<void> {
  const now = new Date()
  await ds.getRepository(CharacterBindingEntity).save({
    id: b.id, projectId: 'p1', standaloneName: b.name ?? b.id, voiceConfig: {},
    createdAt: now, updatedAt: now,
  } as any)
}

async function seedScene2(ds: DataSource): Promise<void> {
  const now = new Date()
  await ds.getRepository(SceneScriptEntity).save({
    id: 's2', episodeScriptId: 'es1', sceneNumber: 2, location: '街头',
    locationBindingId: null, locationType: 'exterior', timeOfDay: 'dusk',
    weather: null, sceneDescription: '', mood: null, lighting: null,
    characters: null, originalText: null, narration: null, dialogues: null, actions: null,
    createdAt: now, updatedAt: now,
  } as any)
}

/** 写 asset_image 行（is_main=1；imagePath='' 即占位行） */
async function seedMainImage(
  ds: DataSource,
  img: { assetType: string; assetId: string; imagePath: string },
): Promise<void> {
  await ds.getRepository(AssetImageEntity).save({
    id: `img-${img.assetId}`, assetType: img.assetType, assetId: img.assetId,
    category: 'main', imagePath: img.imagePath, isMain: 1, createdAt: new Date(),
  } as any)
}

describe('EpisodeReadinessService · assets/storyboard 口径（审计 X1）', () => {
  let ds: DataSource
  let svc: EpisodeReadinessService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new EpisodeReadinessService(ds)
    await seedBase(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('占位行（is_main=1 空 imagePath）→ 出场角色判缺主图', async () => {
    await seedCharBinding(ds, { id: 'cb1', name: '阿甲' })
    await seedSceneCharacter(ds, 'cb1')
    await seedMainImage(ds, { assetType: 'character', assetId: 'cb1', imagePath: '' })

    const r = await svc.evaluateEpisode('ve1')
    expect(r.assets.ready).toBe(false)
    expect(r.assets.missing).toEqual(['角色「阿甲」还没有主图'])
  })

  it('未出场资产缺主图不阻塞；出场资产有主图 → assets 就绪', async () => {
    await seedCharBinding(ds, { id: 'cb1', name: '阿甲' })
    await seedSceneCharacter(ds, 'cb1')
    await seedMainImage(ds, { assetType: 'character', assetId: 'cb1', imagePath: 'assets/cb1.png' })
    // 未出场角色 cb2 没有主图
    await seedCharBinding(ds, { id: 'cb2', name: '路人' })

    const r = await svc.evaluateEpisode('ve1')
    expect(r.assets.ready).toBe(true)
    expect(r.assets.missing).toEqual([])
  })

  it('某场景无分镜 → storyboard 判缺（与 gate 同口径）', async () => {
    await seedScene2(ds)
    await seedShot(ds, { id: 'sb1', shotNumber: 1, videoPath: '/v1.mp4' })

    const r = await svc.evaluateEpisode('ve1')
    expect(r.storyboard.ready).toBe(false)
    expect(r.storyboard.missing).toEqual(['场景 2 尚未生成分镜'])
  })
})
