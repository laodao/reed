/**
 * 关键帧闸门单测（2026-09-21 · E3 审核门成真门）
 *
 * - 坏帧（machineCheck.pass=false / review.status=issues）→ KEYFRAME_GATE_BLOCKED，不调 provider
 * - force=true → 人工强制放行
 * - forceMode='text2video' → 无关键帧输入，跳过闸门
 * - 好帧（machineCheck.pass + review.skipped）→ 放行
 * - 老数据无 metadata → 现场机器校验（真实图片文件），通过则放行
 * - 老数据 review.issues 全是"无法读取图像"（纯文本模型无效结论）→ 按 skipped 放行
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import sharp from 'sharp'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { VideoSegmentService } from '@core/platform/episode-production/render/video/video-segment.service'
import {
  evaluateKeyframeGate,
  KeyframeGateBlockedError,
} from '@core/platform/episode-production/render/video/keyframe-gate'
import { StoryboardKeyframeRepository } from '@core/database/repositories/storyboard-keyframe.repository'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import type {
  VideoProviderAdapter,
  VideoProviderCapabilities,
} from '@core/platform/episode-production/render/video/video-provider-adapter'

const FULL_CAP: VideoProviderCapabilities = {
  text: true,
  image: true,
  keyframes: true,
  maxKeyframes: 9,
  maxDurationSec: 10,
}

function makeAdapter(): VideoProviderAdapter & {
  textToVideo: ReturnType<typeof vi.fn>
  imageToVideo: ReturnType<typeof vi.fn>
  keyframesToVideo: ReturnType<typeof vi.fn>
} {
  return {
    capabilities: FULL_CAP,
    textToVideo: vi.fn(async (opts: any) => ({
      videoPath: '/tmp/t2v.mp4',
      durationSec: opts.durationSec,
      width: opts.width,
      height: opts.height,
    })),
    imageToVideo: vi.fn(async (opts: any) => ({
      videoPath: '/tmp/i2v.mp4',
      durationSec: opts.durationSec,
      width: opts.width,
      height: opts.height,
    })),
    keyframesToVideo: vi.fn(async (opts: any) => ({
      videoPath: '/tmp/k2v.mp4',
      durationSec: opts.durationSec,
      width: opts.width,
      height: opts.height,
    })),
  } as any
}

let tmpDir: string

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [StoryboardEntity, StoryboardKeyframeEntity, ImageAssetEntity, AssetImageEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

/** 噪点正常图（现场机器校验 pass 用） */
async function makeNoiseImage(file: string, seed = 1): Promise<void> {
  const w = 64
  const h = 64
  const buf = Buffer.alloc(w * h * 3)
  let s = seed
  for (let i = 0; i < buf.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    buf[i] = s % 256
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toFile(file)
}

/**
 * seed 一个分镜 + 首尾两帧；metadata 按参数落到 image_assets。
 * imagePath 默认指向真实噪点图（老数据现场校验用）。
 */
async function seedStoryboard(
  ds: DataSource,
  meta: { machineCheck?: unknown; review?: unknown } | null,
  opts?: { realImage?: boolean },
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
    frameDescription: '张三推门进入',
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
    status: 'image_ready',
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

  const iaRepo = new ImageAssetRepository(ds)
  const kfRepo = new StoryboardKeyframeRepository(ds)
  for (const [role, i] of [
    ['start', 0],
    ['end', 1],
  ] as Array<['start' | 'end', number]>) {
    let imagePath = `/tmp/gate_kf_${i}.png`
    if (opts?.realImage !== false) {
      imagePath = path.join(tmpDir, `kf_${i}.png`)
      await makeNoiseImage(imagePath, 100 + i)
    }
    const ia = await iaRepo.create({
      projectId: 'proj1',
      type: 'generated',
      prompt: 'p',
      imagePath,
      width: 1024,
      height: 1024,
      ...(meta ? { metadata: meta as any } : {}),
    })
    await kfRepo.create({
      storyboardId: sbId,
      frameIndex: i,
      timePercent: i,
      frameRole: role,
      imageAssetId: ia.id,
    })
  }
  return { sbId }
}

describe('关键帧闸门（E3）', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-gate-'))
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('坏帧（machineCheck.pass=false）→ 阻断，不调 provider，错误带 code + frames', async () => {
    const { sbId } = await seedStoryboard(ds, {
      machineCheck: { pass: false, failures: [{ code: 'reference_copy', detail: '疑似原样照抄参考图 cb1.png' }] },
      review: { status: 'skipped', issues: [], summary: '审核模型非多模态', model: 'qwen3.8-27b', reviewedAt: 'x' },
    })
    const adapter = makeAdapter()
    const svc = new VideoSegmentService(ds, adapter)

    const err = await svc.generateForStoryboard({ storyboardId: sbId }).catch((e) => e)
    expect(err).toBeInstanceOf(KeyframeGateBlockedError)
    expect(err.code).toBe('KEYFRAME_GATE_BLOCKED')
    expect(err.frames).toHaveLength(2)
    expect(err.frames[0].failures[0]).toContain('照抄')
    expect(adapter.keyframesToVideo).not.toHaveBeenCalled()
    expect(adapter.imageToVideo).not.toHaveBeenCalled()
  })

  it('坏帧 + force=true → 人工强制放行', async () => {
    const { sbId } = await seedStoryboard(ds, {
      machineCheck: { pass: false, failures: [{ code: 'flat_or_blank', detail: '纯色' }] },
      review: { status: 'skipped', issues: [], summary: '', model: '', reviewedAt: 'x' },
    })
    const adapter = makeAdapter()
    const svc = new VideoSegmentService(ds, adapter)

    const result = await svc.generateForStoryboard({ storyboardId: sbId, force: true })
    expect(result.match.mode).toBe('keyframes2video')
    expect(adapter.keyframesToVideo).toHaveBeenCalledTimes(1)
  })

  it("坏帧 + forceMode='text2video' → 跳过闸门走文生视频", async () => {
    const { sbId } = await seedStoryboard(ds, {
      machineCheck: { pass: false, failures: [{ code: 'flat_or_blank', detail: '纯色' }] },
    })
    const adapter = makeAdapter()
    const svc = new VideoSegmentService(ds, adapter)

    const result = await svc.generateForStoryboard({ storyboardId: sbId, forceMode: 'text2video' })
    expect(result.match.mode).toBe('text2video')
    expect(adapter.textToVideo).toHaveBeenCalledTimes(1)
  })

  it('review.status=issues（真问题）→ 阻断', async () => {
    const { sbId } = await seedStoryboard(ds, {
      machineCheck: { pass: true, failures: [] },
      review: { status: 'issues', issues: ['沈云萝的服饰：参考图是素白，关键帧是红裙'], summary: '人物不一致', model: 'qwen-vl-max', reviewedAt: 'x' },
    })
    const svc = new VideoSegmentService(ds, makeAdapter())
    const err = await svc.generateForStoryboard({ storyboardId: sbId }).catch((e) => e)
    expect(err.code).toBe('KEYFRAME_GATE_BLOCKED')
    expect(err.frames[0].failures[0]).toContain('一致性审核存疑')
  })

  it('老数据 review.issues 全是"无法读取图像"（纯文本模型无效结论）→ 按 skipped 放行', async () => {
    const { sbId } = await seedStoryboard(ds, {
      machineCheck: { pass: true, failures: [] },
      review: { status: 'issues', issues: ['无法读取图像内容，无法核验'], summary: '无法读取图像', model: 'qwen3.8-27b', reviewedAt: 'x' },
    })
    const svc = new VideoSegmentService(ds, makeAdapter())
    const result = await svc.generateForStoryboard({ storyboardId: sbId })
    expect(result.match.mode).toBe('keyframes2video')
  })

  it('好帧（machineCheck.pass + review.skipped）→ 放行', async () => {
    const { sbId } = await seedStoryboard(ds, {
      machineCheck: { pass: true, failures: [] },
      review: { status: 'skipped', issues: [], summary: '审核模型非多模态，仅机器校验', model: 'qwen3.8-27b', reviewedAt: 'x' },
    })
    const svc = new VideoSegmentService(ds, makeAdapter())
    const result = await svc.generateForStoryboard({ storyboardId: sbId })
    expect(result.match.mode).toBe('keyframes2video')
  })

  it('老数据无 metadata → 现场机器校验真实图片，正常图放行', async () => {
    const { sbId } = await seedStoryboard(ds, null)
    const svc = new VideoSegmentService(ds, makeAdapter())
    const result = await svc.generateForStoryboard({ storyboardId: sbId })
    expect(result.match.mode).toBe('keyframes2video')
  })

  it('老数据无 metadata + 纯色坏图 → 现场机器校验拦截', async () => {
    // seed 后把首帧图片换成纯色坏图
    const { sbId } = await seedStoryboard(ds, null)
    const flat = path.join(tmpDir, 'flat.png')
    await sharp({ create: { width: 64, height: 64, channels: 3, background: '#336699' } })
      .png()
      .toFile(flat)
    const kfs = await new StoryboardKeyframeRepository(ds).listByStoryboard(sbId)
    const start = kfs.find((k) => k.frameRole === 'start')!
    await new ImageAssetRepository(ds).update(start.imageAssetId!, { imagePath: flat } as any)

    const svc = new VideoSegmentService(ds, makeAdapter())
    const err = await svc.generateForStoryboard({ storyboardId: sbId }).catch((e) => e)
    expect(err.code).toBe('KEYFRAME_GATE_BLOCKED')
  })

  it('evaluateKeyframeGate：无图帧 → 失败', async () => {
    const { sbId } = await seedStoryboard(ds, null)
    const kfRepo = new StoryboardKeyframeRepository(ds)
    await kfRepo.create({
      storyboardId: sbId,
      frameIndex: 2,
      timePercent: 0.5,
      frameRole: 'middle',
      imageAssetId: null,
    })
    const kfs = await kfRepo.listByStoryboard(sbId)
    const result = await evaluateKeyframeGate(ds, kfs.filter((k) => k.frameRole === 'middle'))
    expect(result.pass).toBe(false)
    expect(result.frames[0].failures[0]).toContain('未生成图片')
  })
})
