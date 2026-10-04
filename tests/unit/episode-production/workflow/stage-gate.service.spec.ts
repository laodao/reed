/**
 * StageGateService 单测（2026-09-25 一致性修复 · 审计主题 B / X1）
 *
 * 覆盖 ⑤ 制作完成判定 + completed 末端硬锁的双口径：
 * - 分镜无 videoPath 但所属片段 completed+videoPath → producing 完成，可进 completed（canForce=false）
 * - 所属片段置 superseded 后 → 判定回退为未完成，completed 硬锁拦截
 *
 * 审计 X1（readiness / stage-gate 口径统一）：
 * - 占位行（is_main=1 空 imagePath）不算主图就绪，gate 判缺
 * - gate 主图校验收窄到出场集合：未出场资产缺主图不阻塞，出场资产缺主图仍阻塞
 * - 场景无分镜 → storyboarding 判缺（与 readiness 同口径）
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

async function seedLocBinding(
  ds: DataSource,
  b: { id: string; name?: string },
): Promise<void> {
  const now = new Date()
  await ds.getRepository(LocationBindingEntity).save({
    id: b.id, projectId: 'p1', locationName: b.name ?? b.id, createdAt: now, updatedAt: now,
  } as any)
}

async function seedItemBinding(
  ds: DataSource,
  b: { id: string; name?: string },
): Promise<void> {
  const now = new Date()
  await ds.getRepository(ItemBindingEntity).save({
    id: b.id, projectId: 'p1', itemName: b.name ?? b.id, createdAt: now, updatedAt: now,
  } as any)
}

/** 写 asset_image 行（默认 is_main=1；imagePath='' 即占位行） */
async function seedMainImage(
  ds: DataSource,
  img: { assetType: string; assetId: string; imagePath: string },
): Promise<void> {
  await ds.getRepository(AssetImageEntity).save({
    id: `img-${img.assetId}`, assetType: img.assetType, assetId: img.assetId,
    category: 'main', imagePath: img.imagePath, isMain: 1, createdAt: new Date(),
  } as any)
}

describe('StageGateService · ④→⑤ 主图硬卡（审计 X1 统一口径）', () => {
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

  it('占位行（is_main=1 空 imagePath）→ gate 判缺，④→⑤ 拦截但可 force', async () => {
    await seedCharBinding(ds, { id: 'cb1', name: '阿甲' })
    await seedSceneCharacter(ds, 'cb1')
    await seedMainImage(ds, { assetType: 'character', assetId: 'cb1', imagePath: '' })
    await seedShot(ds, { id: 'sb1', shotNumber: 1 })

    const img = await svc.checkAssetMainImagesReady('ve1')
    expect(img.complete).toBe(false)
    expect(img.gaps).toEqual([
      expect.objectContaining({ code: 'CHARACTER_MAIN_IMAGE_MISSING', targetId: 'cb1' }),
    ])

    const decision = await svc.canEnterStage('ve1', 'storyboarding', 'producing')
    expect(decision.allowed).toBe(false)
    expect(decision.canForce).toBe(true)
    expect(decision.gaps.some((g) => g.code === 'CHARACTER_MAIN_IMAGE_MISSING')).toBe(true)
  })

  it('未出场资产缺主图不再阻塞（角色 / 地点 / 物品均不查），出场资产有主图 → 放行', async () => {
    await seedCharBinding(ds, { id: 'cb1', name: '阿甲' })
    await seedSceneCharacter(ds, 'cb1')
    await seedMainImage(ds, { assetType: 'character', assetId: 'cb1', imagePath: 'assets/cb1.png' })
    // 未出场：角色 cb2 / 地点 lb1 / 物品 ib1 都没有主图
    await seedCharBinding(ds, { id: 'cb2', name: '路人' })
    await seedLocBinding(ds, { id: 'lb1', name: '码头' })
    await seedItemBinding(ds, { id: 'ib1', name: '折扇' })
    await seedShot(ds, { id: 'sb1', shotNumber: 1 })

    const img = await svc.checkAssetMainImagesReady('ve1')
    expect(img.complete).toBe(true)
    expect(img.gaps).toEqual([])

    const decision = await svc.canEnterStage('ve1', 'storyboarding', 'producing')
    expect(decision.allowed).toBe(true)
    expect(decision.gaps).toEqual([])
  })

  it('出场资产无任何主图记录 → 仍阻塞', async () => {
    await seedCharBinding(ds, { id: 'cb1', name: '阿甲' })
    await seedSceneCharacter(ds, 'cb1')
    await seedShot(ds, { id: 'sb1', shotNumber: 1 })

    const img = await svc.checkAssetMainImagesReady('ve1')
    expect(img.complete).toBe(false)
    expect(img.gaps).toEqual([
      expect.objectContaining({ code: 'CHARACTER_MAIN_IMAGE_MISSING', targetId: 'cb1' }),
    ])
  })

  it('某场景无分镜 → storyboarding 判缺（与 readiness 同口径）', async () => {
    const now = new Date()
    await ds.getRepository(SceneScriptEntity).save({
      id: 's2', episodeScriptId: 'es1', sceneNumber: 2, location: '街头',
      locationBindingId: null, locationType: 'exterior', timeOfDay: 'dusk',
      weather: null, sceneDescription: '', mood: null, lighting: null,
      characters: null, originalText: null, narration: null, dialogues: null, actions: null,
      createdAt: now, updatedAt: now,
    } as any)
    await seedShot(ds, { id: 'sb1', shotNumber: 1 })

    const completion = await svc.checkStageComplete('ve1', 'storyboarding')
    expect(completion.complete).toBe(false)
    expect(completion.gaps).toEqual([
      expect.objectContaining({ code: 'SCENE_NO_STORYBOARD', targetId: 's2' }),
    ])
  })
})
