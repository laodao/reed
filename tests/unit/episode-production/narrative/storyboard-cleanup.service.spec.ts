/**
 * storyboard-cleanup.service 单测（2026-09-19 review P2-14 级联清理）
 *
 * 覆盖：
 * - 删分镜连带清 storyboard_characters / storyboard_keyframe 行、image_assets
 *   行与磁盘文件
 * - 关联被删分镜的 ep_video_segments 置 superseded（复用 ep-segmentation 语义）
 * - 整场分镜一并清理（删场景级联语义），未涉分镜/片段不受影响
 * - imageAssetId 为空 / 磁盘文件缺失时不抛错
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardCharacterEntity } from '@core/database/entities/episode-production/storyboard-character.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { cleanupStoryboards } from '@core/platform/episode-production/narrative/storyboard-cleanup.service'
import { registerPathProvider, type IPathProvider } from '@core/interfaces/path.interface'

class StubPathProvider implements IPathProvider {
  constructor(private readonly dataPath: string) {}
  getUserDataPath(): string { return this.dataPath }
  getAppDataPath(): string { return this.dataPath }
  getTempPath(): string { return this.dataPath }
  getDataPath(): string { return this.dataPath }
  getSubDirectories(): never { throw new Error('not used') }
  getSubDirectoryPath(): never { throw new Error('not used') }
  toAssetUrl(rel: string): string { return `/assets/${rel}` }
}

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      StoryboardEntity,
      StoryboardCharacterEntity,
      StoryboardKeyframeEntity,
      ImageAssetEntity,
      EpVideoSegmentEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedStoryboard(
  ds: DataSource,
  sb: { id: string; sceneScriptId?: string; shotNumber?: number; segmentId?: string | null },
): Promise<void> {
  const now = new Date()
  await ds.getRepository(StoryboardEntity).save({
    id: sb.id,
    sceneScriptId: sb.sceneScriptId ?? 's1',
    shotNumber: sb.shotNumber ?? 1,
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
    videoPath: null,
    segmentId: sb.segmentId ?? null,
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

async function seedKeyframe(
  ds: DataSource,
  kf: { id: string; storyboardId: string; imageAssetId?: string | null },
): Promise<void> {
  await ds.getRepository(StoryboardKeyframeEntity).save({
    id: kf.id,
    storyboardId: kf.storyboardId,
    frameIndex: 0,
    timePercent: 0,
    frameRole: 'start',
    imageAssetId: kf.imageAssetId ?? null,
    derivedFromKeyframeId: null,
    prompt: null,
    negativePrompt: null,
    userPromptOverride: null,
    referenceOverrides: null,
    createdAt: new Date(),
    updatedAt: null,
  } as any)
}

async function seedImageAsset(
  ds: DataSource,
  img: { id: string; imagePath: string; thumbnailPath?: string | null },
): Promise<void> {
  await ds.getRepository(ImageAssetEntity).save({
    id: img.id,
    projectId: 'p1',
    type: 'keyframe',
    provider: null,
    model: null,
    prompt: '',
    negativePrompt: null,
    imagePath: img.imagePath,
    thumbnailPath: img.thumbnailPath ?? null,
    width: 1024,
    height: 1024,
    metadata: null,
    createdAt: Date.now(),
  } as any)
}

async function seedSbCharacter(ds: DataSource, id: string, storyboardId: string): Promise<void> {
  await ds.getRepository(StoryboardCharacterEntity).save({
    id,
    storyboardId,
    characterId: 'cb1',
    positionX: 50,
    positionY: 50,
    positionScale: 1,
    expression: null,
    action: null,
    facing: 'front',
    sortOrder: 0,
  } as any)
}

async function seedSegment(
  ds: DataSource,
  seg: { id: string; seq: number; status?: string },
): Promise<void> {
  const now = new Date()
  await ds.getRepository(EpVideoSegmentEntity).save({
    id: seg.id, episodeId: 've1', sceneId: 's1', seq: seg.seq,
    status: seg.status ?? 'completed', shotCount: 1,
    videoPath: `video-segments/${seg.id}.mp4`, createdAt: now, updatedAt: now,
  } as any)
}

describe('cleanupStoryboards', () => {
  let ds: DataSource
  let tmpDir: string

  beforeEach(async () => {
    ds = await buildDb()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-cleanup-'))
    registerPathProvider(() => new StubPathProvider(tmpDir))
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('删分镜级联：keyframe 行 + image_assets 行 + 磁盘文件 + characters 行全清，片段置 superseded', async () => {
    fs.writeFileSync(path.join(tmpDir, 'kf1.png'), 'x')
    fs.writeFileSync(path.join(tmpDir, 'kf1-thumb.png'), 'x')
    await seedImageAsset(ds, { id: 'a1', imagePath: 'kf1.png', thumbnailPath: 'kf1-thumb.png' })
    await seedStoryboard(ds, { id: 'sb1', segmentId: 'seg1' })
    await seedKeyframe(ds, { id: 'kf1', storyboardId: 'sb1', imageAssetId: 'a1' })
    await seedSbCharacter(ds, 'stc1', 'sb1')
    await seedSegment(ds, { id: 'seg1', seq: 1 })

    const summary = await cleanupStoryboards(ds, ['sb1'])

    expect(summary).toEqual({ storyboards: 1, keyframes: 1, supersededSegments: ['seg1'] })
    expect(await ds.getRepository(StoryboardEntity).find()).toHaveLength(0)
    expect(await ds.getRepository(StoryboardKeyframeEntity).find()).toHaveLength(0)
    expect(await ds.getRepository(StoryboardCharacterEntity).find()).toHaveLength(0)
    expect(await ds.getRepository(ImageAssetEntity).find()).toHaveLength(0)
    expect(fs.existsSync(path.join(tmpDir, 'kf1.png'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'kf1-thumb.png'))).toBe(false)
    const seg = await ds.getRepository(EpVideoSegmentEntity).findOne({ where: { id: 'seg1' } })
    expect(seg?.status).toBe('superseded')
    // superseded 保留行与 video_path 可追溯
    expect(seg?.videoPath).toBe('video-segments/seg1.mp4')
  })

  it('整场分镜一并清理（删场景级联语义），未涉分镜/片段不动', async () => {
    await seedStoryboard(ds, { id: 'sb1', sceneScriptId: 's1', shotNumber: 1, segmentId: 'seg1' })
    await seedStoryboard(ds, { id: 'sb2', sceneScriptId: 's1', shotNumber: 2, segmentId: 'seg1' })
    await seedStoryboard(ds, { id: 'sb3', sceneScriptId: 's2', shotNumber: 1, segmentId: 'seg2' })
    await seedKeyframe(ds, { id: 'kf1', storyboardId: 'sb1' })
    await seedKeyframe(ds, { id: 'kf2', storyboardId: 'sb2' })
    await seedKeyframe(ds, { id: 'kf3', storyboardId: 'sb3' })
    await seedSegment(ds, { id: 'seg1', seq: 1 })
    await seedSegment(ds, { id: 'seg2', seq: 2 })

    // 删场景 s1：caller 先按 sceneScriptId 收集分镜 id，再一次性 cleanup
    const s1Shots = await ds.getRepository(StoryboardEntity).find({ where: { sceneScriptId: 's1' } as any })
    const summary = await cleanupStoryboards(ds, s1Shots.map(s => s.id))

    expect(summary.storyboards).toBe(2)
    expect(summary.keyframes).toBe(2)
    expect(summary.supersededSegments).toEqual(['seg1'])
    const remaining = await ds.getRepository(StoryboardEntity).find()
    expect(remaining.map(s => s.id)).toEqual(['sb3'])
    expect(await ds.getRepository(StoryboardKeyframeEntity).find()).toHaveLength(1)
    const seg2 = await ds.getRepository(EpVideoSegmentEntity).findOne({ where: { id: 'seg2' } })
    expect(seg2?.status).toBe('completed')
  })

  it('keyframe 无 imageAssetId / 磁盘文件缺失时不抛错', async () => {
    await seedStoryboard(ds, { id: 'sb1' })
    await seedKeyframe(ds, { id: 'kf1', storyboardId: 'sb1', imageAssetId: null })
    await seedImageAsset(ds, { id: 'a2', imagePath: 'not-there.png' })
    await seedKeyframe(ds, { id: 'kf2', storyboardId: 'sb1', imageAssetId: 'a2' })

    await expect(cleanupStoryboards(ds, ['sb1'])).resolves.toMatchObject({
      storyboards: 1,
      keyframes: 2,
    })
    expect(await ds.getRepository(StoryboardKeyframeEntity).find()).toHaveLength(0)
    expect(await ds.getRepository(ImageAssetEntity).find()).toHaveLength(0)
  })

  it('空 id 列表 / 不存在的 id → no-op', async () => {
    await seedStoryboard(ds, { id: 'sb1' })
    await expect(cleanupStoryboards(ds, [])).resolves.toEqual({
      storyboards: 0, keyframes: 0, supersededSegments: [],
    })
    await expect(cleanupStoryboards(ds, ['nope'])).resolves.toEqual({
      storyboards: 0, keyframes: 0, supersededSegments: [],
    })
    expect(await ds.getRepository(StoryboardEntity).find()).toHaveLength(1)
  })
})
