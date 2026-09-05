/**
 * VideoSegmentService 集成单测（P5-T11）
 *
 * 用 in-memory sqlite + 手写 VideoProviderAdapter mock 验证：
 * - 按 keyframeCount + capabilities 选 mode + dispatch 到对应方法
 * - 写回 storyboard.video_path + video_mode
 * - 强制 forceMode 覆盖自动匹配
 * - keyframes 上限截断（capabilities.maxKeyframes < 实际帧数）
 * - storyboard 不存在抛错
 * - provider 全不支持时抛错
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { VideoSegmentService } from '@core/platform/episode-production/render/video/video-segment.service'
import { StoryboardKeyframeRepository } from '@core/database/repositories/storyboard-keyframe.repository'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import type {
  VideoProviderAdapter,
  VideoProviderCapabilities,
} from '@core/platform/episode-production/render/video/video-provider-adapter'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [StoryboardEntity, StoryboardKeyframeEntity, ImageAssetEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedStoryboardWithKeyframes(
  ds: DataSource,
  keyframeCount: number,
): Promise<{ sbId: string }> {
  const sbId = 'sb1'
  await ds.getRepository(StoryboardEntity).save({
    id: sbId,
    sceneScriptId: 's1',
    shotNumber: 1,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    movementDuration: null,
    frameDescription: '描述：张三推门进入',
    subject: '张三',
    composition: null,
    characters: null,
    narrationId: null,
    dialogueIds: [],
    actionIds: [],
    frameImage: null,
    frameImageId: null,
    videoPath: null,
    duration: 4,
    transition: '{}',
    transitionType: null,
    transitionDurationMs: null,
    transitionDirection: null,
    transitionEasing: null,
    transitionColor: null,
    status: 'pending',
    keyframeCount,
    videoProviderId: null,
    videoModelId: null,
    videoMode: null,
    use3dStaging: 0,
    stagingLayoutId: null,
    backgroundRefImageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)

  // 写 keyframes + image_assets
  const iaRepo = new ImageAssetRepository(ds)
  const kfRepo = new StoryboardKeyframeRepository(ds)
  for (let i = 0; i < keyframeCount; i++) {
    const ia = await iaRepo.create({
      projectId: 'es1',
      type: 'generated',
      prompt: 'p',
      imagePath: `/tmp/kf_${i}.png`,
      width: 1024,
      height: 1024,
    })
    await kfRepo.create({
      storyboardId: sbId,
      frameIndex: i,
      timePercent: keyframeCount > 1 ? i / (keyframeCount - 1) : 0,
      frameRole: i === 0 ? 'start' : i === keyframeCount - 1 ? 'end' : 'middle',
      imageAssetId: ia.id,
    })
  }
  return { sbId }
}

function makeAdapter(
  caps: VideoProviderCapabilities,
  override: Partial<VideoProviderAdapter> = {},
): VideoProviderAdapter & {
  textToVideo: ReturnType<typeof vi.fn>
  imageToVideo: ReturnType<typeof vi.fn>
  keyframesToVideo: ReturnType<typeof vi.fn>
} {
  return {
    capabilities: caps,
    textToVideo: vi.fn(async (opts: any) => ({
      videoPath: `/tmp/text_${opts.prompt}.mp4`,
      durationSec: opts.durationSec,
      width: opts.width,
      height: opts.height,
    })),
    imageToVideo: vi.fn(async (opts: any) => ({
      videoPath: `/tmp/image_${opts.imagePath.split('/').pop()}.mp4`,
      durationSec: opts.durationSec,
      width: opts.width,
      height: opts.height,
    })),
    keyframesToVideo: vi.fn(async (opts: any) => ({
      videoPath: `/tmp/kfs_${opts.keyframes.length}.mp4`,
      durationSec: opts.durationSec,
      width: opts.width,
      height: opts.height,
    })),
    ...override,
  } as any
}

const FULL_CAP: VideoProviderCapabilities = {
  text: true,
  image: true,
  keyframes: true,
  maxKeyframes: 9,
  maxDurationSec: 10,
}

describe('VideoSegmentService', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('3 帧 + 全能 provider → keyframes2video 调用，写 storyboard.video_path', async () => {
    const { sbId } = await seedStoryboardWithKeyframes(ds, 3)
    const adapter = makeAdapter(FULL_CAP)
    const svc = new VideoSegmentService(ds, adapter)

    const result = await svc.generateForStoryboard({ storyboardId: sbId })

    expect(result.match.mode).toBe('keyframes2video')
    expect(result.match.degraded).toBe(false)
    expect(result.keyframesUsed).toHaveLength(3)
    expect(adapter.keyframesToVideo).toHaveBeenCalledTimes(1)
    expect(adapter.imageToVideo).not.toHaveBeenCalled()
    expect(adapter.textToVideo).not.toHaveBeenCalled()

    const sb = await ds.getRepository(StoryboardEntity).findOne({ where: { id: sbId } })
    expect(sb?.videoPath).toBe('/tmp/kfs_3.mp4')
    expect(sb?.videoMode).toBe('keyframes2video')
  })

  it('1 帧 + 全能 → image2video', async () => {
    const { sbId } = await seedStoryboardWithKeyframes(ds, 1)
    const adapter = makeAdapter(FULL_CAP)
    const svc = new VideoSegmentService(ds, adapter)

    const result = await svc.generateForStoryboard({ storyboardId: sbId })
    expect(result.match.mode).toBe('image2video')
    expect(adapter.imageToVideo).toHaveBeenCalledTimes(1)
  })

  it('0 帧 + 全能 → text2video', async () => {
    const { sbId } = await seedStoryboardWithKeyframes(ds, 0)
    const adapter = makeAdapter(FULL_CAP)
    const svc = new VideoSegmentService(ds, adapter)

    const result = await svc.generateForStoryboard({ storyboardId: sbId })
    expect(result.match.mode).toBe('text2video')
    expect(adapter.textToVideo).toHaveBeenCalledTimes(1)
  })

  it('5 帧 + provider maxKeyframes=3 → keyframes2video 用 3 帧（首尾+中间均匀）', async () => {
    const { sbId } = await seedStoryboardWithKeyframes(ds, 5)
    const cap: VideoProviderCapabilities = {
      ...FULL_CAP,
      maxKeyframes: 3,
    }
    const adapter = makeAdapter(cap)
    const svc = new VideoSegmentService(ds, adapter)

    const result = await svc.generateForStoryboard({ storyboardId: sbId })
    expect(result.match.mode).toBe('keyframes2video')
    expect(result.keyframesUsed).toHaveLength(3)

    const callArg = adapter.keyframesToVideo.mock.calls[0][0]
    expect(callArg.keyframes).toHaveLength(3)
    expect(callArg.keyframes[0].timePercent).toBe(0)
    expect(callArg.keyframes[2].timePercent).toBe(1)
  })

  it('3 帧 + provider 仅 image → 降级 image2video', async () => {
    const { sbId } = await seedStoryboardWithKeyframes(ds, 3)
    const cap: VideoProviderCapabilities = {
      text: false,
      image: true,
      keyframes: false,
      maxKeyframes: 0,
      maxDurationSec: 5,
    }
    const adapter = makeAdapter(cap)
    const svc = new VideoSegmentService(ds, adapter)

    const result = await svc.generateForStoryboard({ storyboardId: sbId })
    expect(result.match.mode).toBe('image2video')
    expect(result.match.degraded).toBe(true)
    expect(adapter.imageToVideo).toHaveBeenCalledTimes(1)
  })

  it('forceMode：UI 强制选 text2video（无视 keyframes）', async () => {
    const { sbId } = await seedStoryboardWithKeyframes(ds, 5)
    const adapter = makeAdapter(FULL_CAP)
    const svc = new VideoSegmentService(ds, adapter)

    const result = await svc.generateForStoryboard({
      storyboardId: sbId,
      forceMode: 'text2video',
    })
    expect(result.match.mode).toBe('text2video')
    expect(adapter.textToVideo).toHaveBeenCalledTimes(1)
    expect(adapter.keyframesToVideo).not.toHaveBeenCalled()
  })

  it('storyboard 不存在抛错', async () => {
    const adapter = makeAdapter(FULL_CAP)
    const svc = new VideoSegmentService(ds, adapter)

    await expect(
      svc.generateForStoryboard({ storyboardId: 'sb_ghost' }),
    ).rejects.toThrow(/Storyboard not found/)
  })

  it('provider 全不支持 → 抛错', async () => {
    const { sbId } = await seedStoryboardWithKeyframes(ds, 0)
    const cap: VideoProviderCapabilities = {
      text: false,
      image: false,
      keyframes: false,
      maxKeyframes: 0,
      maxDurationSec: 0,
    }
    const adapter = makeAdapter(cap)
    const svc = new VideoSegmentService(ds, adapter)

    await expect(
      svc.generateForStoryboard({ storyboardId: sbId }),
    ).rejects.toThrow(/无法生成视频/)
  })

  it('forceMode=image2video 但 0 帧 → 抛错（image2video 需至少一帧）', async () => {
    const { sbId } = await seedStoryboardWithKeyframes(ds, 0)
    const adapter = makeAdapter(FULL_CAP)
    const svc = new VideoSegmentService(ds, adapter)

    await expect(
      svc.generateForStoryboard({ storyboardId: sbId, forceMode: 'image2video' }),
    ).rejects.toThrow(/至少一帧/)
  })

  it('F5：生成成功写回 status=completed（此前只写 video_path，列表永远"待生成"）', async () => {
    const { sbId } = await seedStoryboardWithKeyframes(ds, 1)
    const adapter = makeAdapter(FULL_CAP)
    const svc = new VideoSegmentService(ds, adapter)

    await svc.generateForStoryboard({ storyboardId: sbId })

    const sb = await ds.getRepository(StoryboardEntity).findOne({ where: { id: sbId } })
    expect(sb?.videoPath).toBeTruthy()
    expect(sb?.status).toBe('completed')
  })

  it('F5：adapter 调用失败写回 status=error 且继续抛错', async () => {
    const { sbId } = await seedStoryboardWithKeyframes(ds, 0)
    const adapter = makeAdapter(FULL_CAP, {
      textToVideo: vi.fn(async () => {
        throw new Error('provider boom')
      }),
    })
    const svc = new VideoSegmentService(ds, adapter)

    await expect(svc.generateForStoryboard({ storyboardId: sbId })).rejects.toThrow(/provider boom/)

    const sb = await ds.getRepository(StoryboardEntity).findOne({ where: { id: sbId } })
    expect(sb?.status).toBe('error')
    expect(sb?.videoPath).toBeNull()
  })
})
