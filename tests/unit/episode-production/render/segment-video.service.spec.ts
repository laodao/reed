/**
 * SegmentVideoService 单测（tasks/2026-09-04-ep-video-segment-redesign §5）
 *
 * in-memory sqlite + mock VideoProviderAdapter 验证：
 * - text2video：多镜头提示词拼接 + 写回 segment（video_path/mode/duration/prompt 快照/status）
 * - 完成后联动片段内 shots status=completed
 * - image2video：首帧取首镜头首帧关键帧（provider 不支持 keyframes 时降级）
 * - keyframes2video：首镜头 start+end 两帧 refs（O1 首尾帧锚定）
 * - provider 失败 → segment status=error + error 信息，shots 不动
 * - 空片段 / 片段不存在 → 抛错
 *
 * 生成链路全程 mock adapter，不做真实视频调用。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { SegmentVideoService } from '@core/platform/episode-production/render/video/segment-video.service'
import { EpVideoSegmentRepository } from '@core/database/repositories/video-segment.repository'
import { StoryboardRepository } from '@core/database/repositories/storyboard.repository'
import { StoryboardKeyframeRepository } from '@core/database/repositories/storyboard-keyframe.repository'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import type {
  VideoProviderAdapter,
  VideoProviderCapabilities,
} from '@core/platform/episode-production/render/video/video-provider-adapter'

/*
 * R4：end 帧缺失时 SegmentVideoService 会先自动补生成（KeyframeGenerationService）。
 * 这里 mock 掉生成服务（真实生成要打图 provider），用 mockKFBehavior 控制成败：
 *   - 'fail'：补生成抛错 → 降级 i2v
 *   - 'success'：给 end 行挂图（模拟补生成成功落库）→ 走 keyframes2video
 */
let mockKFBehavior: 'success' | 'fail' = 'fail'
vi.mock(
  '@core/platform/episode-production/render/keyframe/keyframe-generation.service',
  () => ({
    KeyframeGenerationService: class {
      constructor(private ds: DataSource) {}
      async regenerateKeyframe(input: { keyframeId: string }) {
        if (mockKFBehavior === 'fail') throw new Error('mock 补生成失败')
        const ia = await new ImageAssetRepository(this.ds).create({
          projectId: 'es1', type: 'generated', prompt: 'p',
          imagePath: '/tmp/kf_end_filled.png', width: 1024, height: 1024,
        })
        await this.ds
          .getRepository(StoryboardKeyframeEntity)
          .update({ id: input.keyframeId }, { imageAssetId: ia.id })
        return { id: input.keyframeId }
      }
      async generateKeyframeAtIndex(input: { storyboardId: string; frameIndex: number }) {
        if (mockKFBehavior === 'fail') throw new Error('mock 补生成失败')
        const ia = await new ImageAssetRepository(this.ds).create({
          projectId: 'es1', type: 'generated', prompt: 'p',
          imagePath: '/tmp/kf_end_filled.png', width: 1024, height: 1024,
        })
        const kf = await new StoryboardKeyframeRepository(this.ds).create({
          storyboardId: input.storyboardId,
          frameIndex: input.frameIndex,
          timePercent: 1,
          frameRole: 'end',
          imageAssetId: ia.id,
        })
        return kf
      }
    },
  }),
)

/*
 * 一致性修复 v2（2026-09-21）：renderPath 缺省 assetRef，本 spec 全部用例验证的是
 * 旧关键帧/文生路径行为（回切档），故 mock 项目视频参数固定 renderPath='keyframe'。
 * assetRef 路径的 prompt 组装见 asset-ref-resolver.spec.ts，链路经雪麓山庄 v3 实跑验证。
 */
vi.mock(
  '@core/platform/episode-production/render/video/project-video-params',
  async (importOriginal) => {
    const mod = await importOriginal<typeof import('@core/platform/episode-production/render/video/project-video-params')>()
    return {
      ...mod,
      resolveVideoParamsForEpisode: async () => ({ renderPath: 'keyframe' as const }),
    }
  },
)

const CAPS: VideoProviderCapabilities = {
  text: true,
  image: true,
  keyframes: false,
  maxKeyframes: 0,
  maxDurationSec: 30,
  subjectSupport: false,
  maxSubjects: 0,
}

/** 全能 capabilities（O1：H3 类 provider 支持首尾两帧 keyframes2video） */
const CAPS_KF: VideoProviderCapabilities = {
  ...CAPS,
  keyframes: true,
  maxKeyframes: 2,
}

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      StoryboardEntity,
      StoryboardKeyframeEntity,
      ImageAssetEntity,
      EpVideoSegmentEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedShot(
  ds: DataSource,
  id: string,
  shotNumber: number,
  frameDescription: string,
  duration: number,
  segmentId: string | null,
  segmentSeq: number | null,
): Promise<void> {
  await ds.getRepository(StoryboardEntity).save({
    id,
    sceneScriptId: 'sc1',
    shotNumber,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    movementDuration: null,
    frameDescription,
    subject: null,
    composition: null,
    characters: null,
    narrationId: null,
    dialogueIds: [],
    actionIds: [],
    frameImage: null,
    frameImageId: null,
    videoPath: null,
    duration,
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
    segmentId,
    segmentSeq,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

/** 种一个 2 镜片段（5s + 4s，est 9s） */
async function seedSegment(ds: DataSource): Promise<string> {
  const segRepo = new EpVideoSegmentRepository(ds)
  const seg = await segRepo.create({
    episodeId: 'ep1',
    sceneId: 'sc1',
    seq: 1,
    shotCount: 2,
    estDuration: 9,
  })
  await seedShot(ds, 'sb1', 1, '苏晚伏案修书', 5, seg.id, 1)
  await seedShot(ds, 'sb2', 2, '古书无风自动', 4, seg.id, 2)
  return seg.id
}

function makeAdapter(override: Partial<VideoProviderAdapter> = {}) {
  return {
    capabilities: CAPS,
    textToVideo: vi.fn(async (opts: any) => ({
      videoPath: '/tmp/seg_out.mp4',
      durationSec: opts.durationSec,
      width: opts.width,
      height: opts.height,
    })),
    imageToVideo: vi.fn(async (opts: any) => ({
      videoPath: '/tmp/seg_i2v.mp4',
      durationSec: opts.durationSec,
      width: opts.width,
      height: opts.height,
    })),
    keyframesToVideo: vi.fn(async (opts: any) => ({
      videoPath: '/tmp/seg_kf2v.mp4',
      durationSec: opts.durationSec,
      width: opts.width,
      height: opts.height,
    })),
    ...override,
  } as VideoProviderAdapter & {
    textToVideo: ReturnType<typeof vi.fn>
    imageToVideo: ReturnType<typeof vi.fn>
    keyframesToVideo: ReturnType<typeof vi.fn>
  }
}

/** 给首镜头 sb1 种 start + end 两张带图关键帧 */
async function seedFirstShotStartEnd(ds: DataSource): Promise<void> {
  const iaRepo = new ImageAssetRepository(ds)
  const kfRepo = new StoryboardKeyframeRepository(ds)
  const ia1 = await iaRepo.create({
    projectId: 'es1', type: 'generated', prompt: 'p',
    imagePath: '/tmp/kf_first.png', width: 1024, height: 1024,
  })
  const ia2 = await iaRepo.create({
    projectId: 'es1', type: 'generated', prompt: 'p',
    imagePath: '/tmp/kf_second.png', width: 1024, height: 1024,
  })
  await kfRepo.create({ storyboardId: 'sb1', frameIndex: 0, frameRole: 'start', imageAssetId: ia1.id })
  await kfRepo.create({ storyboardId: 'sb1', frameIndex: 1, frameRole: 'end', imageAssetId: ia2.id })
}

describe('SegmentVideoService', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
    mockKFBehavior = 'fail'
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('text2video：拼接多镜提示词 + 写回 segment + 联动 shots completed', async () => {
    const segId = await seedSegment(ds)
    const adapter = makeAdapter()
    const svc = new SegmentVideoService(ds, adapter)

    const result = await svc.generateForSegment({ segmentId: segId })

    // 一次视频调用；提示词按 segment_seq 拼接
    expect(adapter.textToVideo).toHaveBeenCalledTimes(1)
    const call = adapter.textToVideo.mock.calls[0][0]
    expect(call.prompt).toContain('镜头1（约5s，中景，平视，固定镜头）：苏晚伏案修书')
    expect(call.prompt).toContain('镜头2（约4s，中景，平视，固定镜头）：古书无风自动')
    expect(call.prompt).toContain('总时长约9s')
    expect(call.durationSec).toBe(9)

    // segment 写回
    const segRepo = new EpVideoSegmentRepository(ds)
    const seg = await segRepo.getById(segId)
    expect(seg?.status).toBe('completed')
    expect(seg?.videoPath).toBe('/tmp/seg_out.mp4')
    expect(seg?.videoMode).toBe('text2video')
    expect(seg?.duration).toBe(9)
    expect(seg?.prompt).toContain('镜头1')
    expect(seg?.error).toBeNull()
    expect(result.completedStoryboardIds).toEqual(['sb1', 'sb2'])

    // 联动 shots
    const sbRepo = new StoryboardRepository(ds)
    expect((await sbRepo.getById('sb1'))?.status).toBe('completed')
    expect((await sbRepo.getById('sb2'))?.status).toBe('completed')
  })

  it('image2video：provider 不支持 keyframes → 降级用首帧', async () => {
    const segId = await seedSegment(ds)
    // 首镜头种 2 帧关键帧（有图）；第二镜头的关键帧不应被用
    await seedFirstShotStartEnd(ds)

    const adapter = makeAdapter()
    const svc = new SegmentVideoService(ds, adapter)
    const result = await svc.generateForSegment({ segmentId: segId })

    expect(result.match.mode).toBe('image2video')
    expect(adapter.imageToVideo).toHaveBeenCalledTimes(1)
    expect(adapter.imageToVideo.mock.calls[0][0].imagePath).toBe('/tmp/kf_first.png')
    expect(result.keyframesUsed).toHaveLength(1)
    const seg = await new EpVideoSegmentRepository(ds).getById(segId)
    expect(seg?.videoMode).toBe('image2video')
  })

  it('keyframes2video（O1）：首镜头 start+end 两帧 refs，middle/第二镜头不参与', async () => {
    const segId = await seedSegment(ds)
    await seedFirstShotStartEnd(ds)
    // middle 帧有图也不应进入 refs
    const iaRepo = new ImageAssetRepository(ds)
    const kfRepo = new StoryboardKeyframeRepository(ds)
    const iaMid = await iaRepo.create({
      projectId: 'es1', type: 'generated', prompt: 'p',
      imagePath: '/tmp/kf_mid.png', width: 1024, height: 1024,
    })
    await kfRepo.create({ storyboardId: 'sb1', frameIndex: 2, frameRole: 'middle', imageAssetId: iaMid.id })

    const adapter = makeAdapter({ capabilities: CAPS_KF })
    const svc = new SegmentVideoService(ds, adapter)
    const result = await svc.generateForSegment({ segmentId: segId })

    expect(result.match.mode).toBe('keyframes2video')
    expect(adapter.keyframesToVideo).toHaveBeenCalledTimes(1)
    const kfs = adapter.keyframesToVideo.mock.calls[0][0].keyframes
    expect(kfs).toHaveLength(2)
    expect(kfs[0].imagePath).toBe('/tmp/kf_first.png')
    expect(kfs[0].timePercent).toBe(0)
    expect(kfs[1].imagePath).toBe('/tmp/kf_second.png')
    expect(kfs[1].timePercent).toBe(1)
    expect(result.keyframesUsed).toHaveLength(2)
    const seg = await new EpVideoSegmentRepository(ds).getById(segId)
    expect(seg?.videoMode).toBe('keyframes2video')
    expect(seg?.videoPath).toBe('/tmp/seg_kf2v.mp4')
  })

  it('R4：end 帧无图 → 先自动补生成，补失败才降级 image2video 仅用首帧', async () => {
    mockKFBehavior = 'fail'
    const segId = await seedSegment(ds)
    const iaRepo = new ImageAssetRepository(ds)
    const kfRepo = new StoryboardKeyframeRepository(ds)
    const ia1 = await iaRepo.create({
      projectId: 'es1', type: 'generated', prompt: 'p',
      imagePath: '/tmp/kf_first.png', width: 1024, height: 1024,
    })
    await kfRepo.create({ storyboardId: 'sb1', frameIndex: 0, frameRole: 'start', imageAssetId: ia1.id })
    await kfRepo.create({ storyboardId: 'sb1', frameIndex: 1, frameRole: 'end', imageAssetId: null })

    const adapter = makeAdapter({ capabilities: CAPS_KF })
    const svc = new SegmentVideoService(ds, adapter)
    const result = await svc.generateForSegment({ segmentId: segId })

    expect(result.match.mode).toBe('image2video')
    expect(adapter.imageToVideo).toHaveBeenCalledTimes(1)
    expect(adapter.imageToVideo.mock.calls[0][0].imagePath).toBe('/tmp/kf_first.png')
    expect(result.keyframesUsed).toHaveLength(1)
  })

  it('R4：end 帧无图 → 自动补生成成功 → 走 keyframes2video 首尾双锚', async () => {
    mockKFBehavior = 'success'
    const segId = await seedSegment(ds)
    const iaRepo = new ImageAssetRepository(ds)
    const kfRepo = new StoryboardKeyframeRepository(ds)
    const ia1 = await iaRepo.create({
      projectId: 'es1', type: 'generated', prompt: 'p',
      imagePath: '/tmp/kf_first.png', width: 1024, height: 1024,
    })
    await kfRepo.create({ storyboardId: 'sb1', frameIndex: 0, frameRole: 'start', imageAssetId: ia1.id })
    await kfRepo.create({ storyboardId: 'sb1', frameIndex: 1, frameRole: 'end', imageAssetId: null })

    const adapter = makeAdapter({ capabilities: CAPS_KF })
    const svc = new SegmentVideoService(ds, adapter)
    const result = await svc.generateForSegment({ segmentId: segId })

    // 补生成成功 → end 帧挂图 → 首尾两帧进 kf2v
    expect(result.match.mode).toBe('keyframes2video')
    expect(adapter.keyframesToVideo).toHaveBeenCalledTimes(1)
    expect(result.keyframesUsed.map((k) => k.imagePath)).toEqual([
      '/tmp/kf_first.png',
      '/tmp/kf_end_filled.png',
    ])
  })

  it('R4：end 帧行不存在 → generateKeyframeAtIndex 补建行 → 走 keyframes2video', async () => {
    mockKFBehavior = 'success'
    const segId = await seedSegment(ds)
    const iaRepo = new ImageAssetRepository(ds)
    const kfRepo = new StoryboardKeyframeRepository(ds)
    const ia1 = await iaRepo.create({
      projectId: 'es1', type: 'generated', prompt: 'p',
      imagePath: '/tmp/kf_first.png', width: 1024, height: 1024,
    })
    // 只有 start 帧行，没有 end 行
    await kfRepo.create({ storyboardId: 'sb1', frameIndex: 0, frameRole: 'start', imageAssetId: ia1.id })

    const adapter = makeAdapter({ capabilities: CAPS_KF })
    const svc = new SegmentVideoService(ds, adapter)
    const result = await svc.generateForSegment({ segmentId: segId })

    expect(result.match.mode).toBe('keyframes2video')
    expect(result.keyframesUsed.map((k) => k.imagePath)).toEqual([
      '/tmp/kf_first.png',
      '/tmp/kf_end_filled.png',
    ])
  })

  it('provider 失败 → segment status=error + error 信息，shots 不置 completed', async () => {
    const segId = await seedSegment(ds)
    const adapter = makeAdapter({
      textToVideo: vi.fn(async () => {
        throw new Error('quota exhausted')
      }),
    })
    const svc = new SegmentVideoService(ds, adapter)

    await expect(svc.generateForSegment({ segmentId: segId })).rejects.toThrow(
      'quota exhausted',
    )
    const seg = await new EpVideoSegmentRepository(ds).getById(segId)
    expect(seg?.status).toBe('error')
    expect(seg?.error).toContain('quota exhausted')
    const sbRepo = new StoryboardRepository(ds)
    expect((await sbRepo.getById('sb1'))?.status).toBe('pending')
  })

  it('片段不存在 → 抛错', async () => {
    const svc = new SegmentVideoService(ds, makeAdapter())
    await expect(
      svc.generateForSegment({ segmentId: 'evs_ghost' }),
    ).rejects.toThrow(/不存在/)
  })

  it('空片段（无分镜）→ 抛错', async () => {
    const segRepo = new EpVideoSegmentRepository(ds)
    const seg = await segRepo.create({
      episodeId: 'ep1', sceneId: 'sc1', seq: 1, shotCount: 0, estDuration: 0,
    })
    const svc = new SegmentVideoService(ds, makeAdapter())
    await expect(
      svc.generateForSegment({ segmentId: seg.id }),
    ).rejects.toThrow(/没有分镜/)
    // 失败后状态回 error 之前保持原状（抛错发生在置 generating 之前）
    expect((await segRepo.getById(seg.id))?.status).toBe('pending')
  })
})
