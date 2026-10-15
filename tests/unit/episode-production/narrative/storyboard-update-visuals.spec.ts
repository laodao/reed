/**
 * ep:update-storyboard 画面内容变更级联作废单测（2026-09-24 审计 X3 · 第四批 Task 4）
 *
 * 覆盖：
 * - (c) 改 frameDescription → 关键帧（storyboard_keyframe + image_assets +
 *   磁盘文件）作废、自身 videoPath 清空 + status 回退 pending、所属未
 *   superseded 片段置 superseded
 * - (d) 仅改 dialogueIds（只重建 links）/ duration / 同值 frameDescription
 *   → 不作废画面产物
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { StoryboardRepository } from '@core/database/repositories/storyboard.repository'
import { registerPathProvider, type IPathProvider } from '@core/interfaces/path.interface'

vi.mock('@core/packs/episode-production/services/story-to-video-ai.service', () => ({
  StoryToVideoAIService: { getInstance: () => ({}) },
}))

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

let ds: DataSource
let storyboards: StoryboardRepository
let tmpDir: string

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    get dataSource() {
      return ds
    },
    get storyboards() {
      return storyboards
    },
  }),
}))

import { invokeIpc } from '@core/ipc/ipc-bridge'
import { registerStoryboardHandlers } from '@core/packs/episode-production/handlers/narrative/storyboard.handler'

interface Resp<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

async function buildDb(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      StoryboardEntity,
      SceneDialogueEntity,
      StoryboardKeyframeEntity,
      ImageAssetEntity,
      EpVideoSegmentEntity,
    ],
    synchronize: true,
  })
  await dataSource.initialize()
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS storyboard_dialogue_links (
      id TEXT PRIMARY KEY,
      storyboard_id TEXT NOT NULL,
      dialogue_id TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
      FOREIGN KEY (dialogue_id) REFERENCES scene_dialogues(id) ON DELETE CASCADE
    )
  `)
  return dataSource
}

/** 种一个「已出片」分镜：videoPath + status completed + 关键帧/图/磁盘文件 + 片段 */
async function seedProducedStoryboard(): Promise<void> {
  const now = new Date()
  await ds.getRepository(StoryboardEntity).save({
    id: 'sb1',
    sceneScriptId: 's1',
    shotNumber: 1,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    movementDuration: null,
    frameDescription: '旧画面',
    subject: null,
    composition: null,
    characters: null,
    narrationId: null,
    dialogueIds: [],
    actionIds: [],
    frameImage: null,
    frameImageId: null,
    videoPath: 'clips/sb1.mp4',
    segmentId: 'seg1',
    segmentSeq: 1,
    duration: 4,
    transition: '{}',
    transitionType: null,
    transitionDurationMs: null,
    transitionDirection: null,
    transitionEasing: null,
    transitionColor: null,
    status: 'completed',
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
  fs.writeFileSync(path.join(tmpDir, 'kf1.png'), 'x')
  await ds.getRepository(ImageAssetEntity).save({
    id: 'a1',
    projectId: 'p1',
    type: 'keyframe',
    provider: null,
    model: null,
    prompt: '',
    negativePrompt: null,
    imagePath: 'kf1.png',
    thumbnailPath: null,
    width: 1024,
    height: 1024,
    metadata: null,
    createdAt: Date.now(),
  } as any)
  await ds.getRepository(StoryboardKeyframeEntity).save({
    id: 'kf1',
    storyboardId: 'sb1',
    frameIndex: 0,
    timePercent: 0,
    frameRole: 'start',
    imageAssetId: 'a1',
    derivedFromKeyframeId: null,
    prompt: null,
    negativePrompt: null,
    userPromptOverride: null,
    referenceOverrides: null,
    createdAt: new Date(),
    updatedAt: null,
  } as any)
  await ds.getRepository(EpVideoSegmentEntity).save({
    id: 'seg1', episodeId: 've1', sceneId: 's1', seq: 1,
    status: 'completed', shotCount: 1,
    videoPath: 'video-segments/seg1.mp4', createdAt: now, updatedAt: now,
  } as any)
}

async function visualState(): Promise<{
  videoPath: string | null
  status: string
  keyframes: number
  imageAssets: number
  segmentStatus: string | undefined
  kfFileExists: boolean
}> {
  const sb = await ds.getRepository(StoryboardEntity).findOne({ where: { id: 'sb1' } })
  const seg = await ds.getRepository(EpVideoSegmentEntity).findOne({ where: { id: 'seg1' } })
  return {
    videoPath: sb?.videoPath ?? null,
    status: sb?.status ?? '',
    keyframes: await ds.getRepository(StoryboardKeyframeEntity).count(),
    imageAssets: await ds.getRepository(ImageAssetEntity).count(),
    segmentStatus: seg?.status,
    kfFileExists: fs.existsSync(path.join(tmpDir, 'kf1.png')),
  }
}

describe('ep:update-storyboard 画面内容级联作废（X3）', () => {
  beforeEach(async () => {
    ds = await buildDb()
    storyboards = new StoryboardRepository(ds)
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-visual-'))
    registerPathProvider(() => new StubPathProvider(tmpDir))
    registerStoryboardHandlers()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('(c) 改 frameDescription：关键帧/图/磁盘文件作废，videoPath 清空 + status 回退，片段 superseded', async () => {
    await seedProducedStoryboard()

    const res = (await invokeIpc('ep:update-storyboard', [
      'sb1',
      { frameDescription: '新画面' },
    ])) as Resp<{ frameDescription: string; videoPath?: string; status: string }>
    expect(res.success).toBe(true)
    expect(res.data!.frameDescription).toBe('新画面')

    const state = await visualState()
    expect(state.videoPath).toBeNull()
    expect(state.status).toBe('pending')
    expect(state.keyframes).toBe(0)
    expect(state.imageAssets).toBe(0)
    expect(state.kfFileExists).toBe(false)
    expect(state.segmentStatus).toBe('superseded')
    // 响应 DTO 反映作废后的状态
    expect(res.data!.videoPath).toBeUndefined()
    expect(res.data!.status).toBe('pending')
  })

  it('(c2) 改 characters / locationBindingIds / referenceImageIds 同样触发作废', async () => {
    for (const patch of [
      { characters: [{ characterId: 'c1' }] },
      { locationBindingIds: ['loc_1'] },
      { referenceImageIds: { 'character:cb1': 'img_1' } },
    ]) {
      await seedProducedStoryboard()
      const res = (await invokeIpc('ep:update-storyboard', ['sb1', patch])) as Resp
      expect(res.success).toBe(true)
      const state = await visualState()
      expect(state.videoPath).toBeNull()
      expect(state.keyframes).toBe(0)
      expect(state.segmentStatus).toBe('superseded')
      // 复原供下一个 patch
      await ds.getRepository(StoryboardEntity).delete({ id: 'sb1' } as any)
      await ds.getRepository(EpVideoSegmentEntity).delete({ id: 'seg1' } as any)
    }
  })

  it('(d) 仅改 dialogueIds：只重建 links，不作废画面产物', async () => {
    await seedProducedStoryboard()
    await ds.getRepository(SceneDialogueEntity).save({
      id: 'd1', sceneScriptId: 's1', characterId: 'c1', characterBindingId: null,
      characterName: '张三', text: '台词', emotion: null, volume: 'normal',
      pace: 'normal', pause: 0, voiceId: null, audioAssetId: null, sortOrder: 0,
    } as any)

    const res = (await invokeIpc('ep:update-storyboard', ['sb1', { dialogueIds: ['d1'] }])) as Resp
    expect(res.success).toBe(true)

    const links = await ds.query(
      `SELECT dialogue_id FROM storyboard_dialogue_links WHERE storyboard_id = 'sb1'`,
    )
    expect(links.map((l: any) => l.dialogue_id)).toEqual(['d1'])

    const state = await visualState()
    expect(state.videoPath).toBe('clips/sb1.mp4')
    expect(state.status).toBe('completed')
    expect(state.keyframes).toBe(1)
    expect(state.imageAssets).toBe(1)
    expect(state.kfFileExists).toBe(true)
    expect(state.segmentStatus).toBe('completed')
  })

  it('(d2) 仅改 duration / 同值 frameDescription：不作废画面产物', async () => {
    await seedProducedStoryboard()

    const resDuration = (await invokeIpc('ep:update-storyboard', ['sb1', { duration: 9 }])) as Resp
    expect(resDuration.success).toBe(true)
    const resSame = (await invokeIpc('ep:update-storyboard', [
      'sb1',
      { frameDescription: '旧画面' },
    ])) as Resp
    expect(resSame.success).toBe(true)

    const state = await visualState()
    expect(state.videoPath).toBe('clips/sb1.mp4')
    expect(state.status).toBe('completed')
    expect(state.keyframes).toBe(1)
    expect(state.segmentStatus).toBe('completed')
  })
})
