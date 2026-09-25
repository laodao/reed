/**
 * assetRef2video provider 守卫单测（2026-09-25 一致性修复 Task 2 · V1）
 *
 * assetRef 路径的 refs 语义=主体外观（仅 ComfyUI H3 网关匹配）；
 * image 语义=首帧的 provider（火山/百炼等）必须被 capabilities.subjectReference
 * 守卫显式拦截，不得静默把编号参考板当首帧发出。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { SegmentVideoService } from '@core/platform/episode-production/render/video/segment-video.service'
import { EpVideoSegmentRepository } from '@core/database/repositories/video-segment.repository'
import type {
  VideoProviderAdapter,
  VideoProviderCapabilities,
} from '@core/platform/episode-production/render/video/video-provider-adapter'

/*
 * 与 segment-video.service.spec.ts 同因：真实 KeyframeGenerationService 的静态 import 链
 * 会加载 sharp 原生模块（sharp-worker），vitest worker 退出时偶发 segfault；
 * assetRef 路径不会触达补生成，mock 掉即可。
 */
vi.mock(
  '@core/platform/episode-production/render/keyframe/keyframe-generation.service',
  () => ({
    KeyframeGenerationService: class {
      async regenerateKeyframe() {
        throw new Error('mock：assetRef 路径不应触达补生成')
      }
      async generateKeyframeAtIndex() {
        throw new Error('mock：assetRef 路径不应触达补生成')
      }
    },
  }),
)

vi.mock(
  '@core/platform/episode-production/render/video/project-video-params',
  async (importOriginal) => {
    const mod = await importOriginal<typeof import('@core/platform/episode-production/render/video/project-video-params')>()
    return {
      ...mod,
      resolveVideoParamsForEpisode: async () => ({ renderPath: 'assetRef' as const }),
    }
  },
)

const CAPS_NO_SUBJECT_REF: VideoProviderCapabilities = {
  text: true,
  image: true,
  keyframes: false,
  maxKeyframes: 0,
  maxDurationSec: 30,
}

const CAPS_SUBJECT_REF: VideoProviderCapabilities = {
  ...CAPS_NO_SUBJECT_REF,
  subjectReference: true,
}

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [StoryboardEntity, StoryboardKeyframeEntity, ImageAssetEntity, EpVideoSegmentEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedSegmentWithShot(ds: DataSource): Promise<string> {
  const seg = await new EpVideoSegmentRepository(ds).create({
    episodeId: 'ep1',
    sceneId: 'sc1',
    seq: 1,
    shotCount: 1,
    estDuration: 5,
  })
  await ds.getRepository(StoryboardEntity).save({
    id: 'sb1',
    sceneScriptId: 'sc1',
    shotNumber: 1,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    frameDescription: '苏晚伏案修书',
    characters: [],
    dialogueIds: [],
    actionIds: [],
    duration: 5,
    transition: '{}',
    status: 'pending',
    keyframeCount: 2,
    use3dStaging: 0,
    segmentId: seg.id,
    segmentSeq: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  return seg.id
}

function makeAdapter(capabilities: VideoProviderCapabilities) {
  return {
    capabilities,
    imageToVideo: vi.fn(async () => ({
      videoPath: '/tmp/seg_out.mp4',
      durationSec: 5,
      width: 1920,
      height: 1080,
    })),
  } as unknown as VideoProviderAdapter & { imageToVideo: ReturnType<typeof vi.fn> }
}

describe('SegmentVideoService · assetRef provider 守卫（V1）', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('provider 不支持「参考图=主体外观」→ 明确报错并提示换 ComfyUI / 回切关键帧，不发视频调用', async () => {
    const segId = await seedSegmentWithShot(ds)
    const adapter = makeAdapter(CAPS_NO_SUBJECT_REF)
    const svc = new SegmentVideoService(ds, adapter)

    await expect(svc.generateForSegment({ segmentId: segId })).rejects.toThrow(
      /参考图=主体外观/,
    )
    await expect(svc.generateForSegment({ segmentId: segId })).rejects.toThrow(
      /renderPath=keyframe/,
    )
    expect(adapter.imageToVideo).not.toHaveBeenCalled()
  })

  it('provider 声明 subjectReference（ComfyUI 网关）→ 守卫放行，走到资产解析', async () => {
    const segId = await seedSegmentWithShot(ds)
    const adapter = makeAdapter(CAPS_SUBJECT_REF)
    const svc = new SegmentVideoService(ds, adapter)

    // 分镜无资产绑定 → 守卫已通过，落在「未解析到任何资产参考」
    await expect(svc.generateForSegment({ segmentId: segId })).rejects.toThrow(
      /未解析到任何资产参考/,
    )
    expect(adapter.imageToVideo).not.toHaveBeenCalled()
  })
})
