/**
 * KeyframeReviewService 单测（2026-09-19 · 复盘整改）
 *
 * 覆盖：
 * - reviewKeyframe：VLM pass / issues / 非法 JSON / 调用抛错 四种结局落库 image_assets.metadata.review
 * - 参考图选取：优先 referenceImageIdsEffective（能力截断后的真实输入），老数据回退 referenceImageIds
 * - reviewStoryboardKeyframes：无图帧跳过不中断
 * - 无图关键帧 / 缺资产 → 抛错
 *
 * callVLMMulti 走 vi.mock；图片用真实临时文件（readImageAsDataUrl 内部 fs 读取）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'

const callVLMMultiMock = vi.fn()

vi.mock('@core/platform/services/ai-call', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@core/platform/services/ai-call')>()
  return {
    ...orig,
    callVLMMulti: (...args: unknown[]) => callVLMMultiMock(...args),
  }
})

import { KeyframeReviewService } from '@core/platform/episode-production/render/keyframe/keyframe-review.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      StoryboardEntity,
      StoryboardKeyframeEntity,
      SceneScriptEntity,
      EpisodeScriptEntity,
      VideoEpisodeEntity,
      VideoProjectEntity,
      AssetImageEntity,
      ImageAssetEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

let tmpDir: string
let kfImagePath: string
let refImagePath: string

/** seed：场景→分镜→关键帧(带图) + 参考图资产行 */
async function seed(ds: DataSource, meta?: Record<string, unknown>): Promise<{ kfId: string; iaId: string }> {
  await ds.getRepository(SceneScriptEntity).save({
    id: 's1',
    episodeScriptId: 'es1',
    sceneNumber: 1,
    location: '茶馆',
    locationBindingId: null,
    locationType: 'interior',
    timeOfDay: 'morning',
    weather: 'sunny',
    sceneDescription: '清晨茶馆',
    mood: null,
    lighting: null,
    characters: [],
    originalText: '',
    narration: '',
    dialogues: [],
    actions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  await ds.getRepository(StoryboardEntity).save({
    id: 'sb1',
    sceneScriptId: 's1',
    shotNumber: 1,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    movementDuration: null,
    frameDescription: '张三推门进入茶馆',
    subject: '张三',
    composition: null,
    characters: null,
    narrationId: null,
    dialogueIds: [],
    actionIds: [],
    frameImage: null,
    frameImageId: null,
    videoPath: null,
    duration: 3,
    transition: '{}',
    transitionType: null,
    transitionDurationMs: null,
    transitionDirection: null,
    transitionEasing: null,
    transitionColor: null,
    status: 'image_ready',
    keyframeCount: 3,
    videoProviderId: null,
    videoModelId: null,
    providerTaskId: null,
    videoMode: null,
    use3dStaging: 0,
    stagingLayoutId: null,
    backgroundRefImageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  await ds.getRepository(AssetImageEntity).save({
    id: 'ai_ref',
    assetType: 'character',
    assetId: 'cb1',
    category: 'main',
    imagePath: refImagePath,
    isMain: 1,
    confirmed: 1,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  const iaRepo = new ImageAssetRepository(ds)
  const ia = await iaRepo.create({
    projectId: 'proj1',
    type: 'generated',
    prompt: '张三推门',
    imagePath: kfImagePath,
    width: 1344,
    height: 768,
    metadata: meta ?? {
      subType: 'storyboard_keyframe',
      storyboardId: 'sb1',
      referenceImageIds: ['ai_ref'],
      referenceImageIdsEffective: ['ai_ref'],
    },
  })
  await ds.getRepository(StoryboardKeyframeEntity).save({
    id: 'kf1',
    storyboardId: 'sb1',
    frameIndex: 0,
    timePercent: 0,
    frameRole: 'start',
    imageAssetId: ia.id,
    derivedFromKeyframeId: null,
    prompt: 'character: 张三, wearing 蓝色长衫, 推门',
    negativePrompt: null,
    userPromptOverride: null,
    referenceOverrides: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  return { kfId: 'kf1', iaId: ia.id }
}

describe('KeyframeReviewService', () => {
  let ds: DataSource
  let svc: KeyframeReviewService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new KeyframeReviewService(ds)
    callVLMMultiMock.mockReset()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-review-'))
    kfImagePath = path.join(tmpDir, 'kf.png')
    refImagePath = path.join(tmpDir, 'ref.png')
    fs.writeFileSync(kfImagePath, Buffer.from('fake-kf'))
    fs.writeFileSync(refImagePath, Buffer.from('fake-ref'))
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('VLM 判定一致 → status=pass 落库 metadata.review', async () => {
    const { kfId, iaId } = await seed(ds)
    callVLMMultiMock.mockResolvedValue(JSON.stringify({
      consistent: true,
      issues: [],
      summary: '人物服饰与参考图一致',
    }))

    const review = await svc.reviewKeyframe(kfId)

    expect(review.status).toBe('pass')
    expect(review.issues).toEqual([])
    // 关键帧本体 + 1 张生效参考图 = 2 张图进 VLM
    expect(callVLMMultiMock).toHaveBeenCalledTimes(1)
    const imgs = callVLMMultiMock.mock.calls[0][1] as string[]
    expect(imgs).toHaveLength(2)
    expect(imgs[0]).toMatch(/^data:image\//)

    const ia = await new ImageAssetRepository(ds).getById(iaId)
    expect((ia?.metadata as any)?.review?.status).toBe('pass')
    // 原有 metadata 字段不被覆盖
    expect((ia?.metadata as any)?.referenceImageIds).toEqual(['ai_ref'])
  })

  it('VLM 判定不一致 → status=issues 且 issues 透传', async () => {
    const { kfId } = await seed(ds)
    callVLMMultiMock.mockResolvedValue(JSON.stringify({
      consistent: false,
      issues: ['阿蘅的服饰：参考图是素白医袍，关键帧是红色长裙'],
      summary: '人物服饰不一致',
    }))

    const review = await svc.reviewKeyframe(kfId)
    expect(review.status).toBe('issues')
    expect(review.issues[0]).toContain('素白医袍')
  })

  it('VLM 输出非 JSON → status=error（不假装通过）', async () => {
    const { kfId } = await seed(ds)
    callVLMMultiMock.mockResolvedValue('这张图画得不错')

    const review = await svc.reviewKeyframe(kfId)
    expect(review.status).toBe('error')
    expect(review.issues[0]).toContain('JSON')
  })

  it('VLM 调用抛错 → 不抛出，落 error 态（校验失败不阻断制作）', async () => {
    const { kfId } = await seed(ds)
    callVLMMultiMock.mockRejectedValue(new Error('429 额度不足'))

    const review = await svc.reviewKeyframe(kfId)
    expect(review.status).toBe('error')
    expect(review.issues[0]).toContain('429')
  })

  it('参考图优先取 referenceImageIdsEffective（截断后的真实输入）', async () => {
    // 再塞一张参考图资产；metadata 里全量 2 张、生效 1 张
    await ds.getRepository(AssetImageEntity).save({
      id: 'ai_ref2',
      assetType: 'location',
      assetId: 'lb1',
      category: 'main',
      imagePath: refImagePath,
      isMain: 1,
      confirmed: 1,
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    const { kfId } = await seed(ds, {
      subType: 'storyboard_keyframe',
      storyboardId: 'sb1',
      referenceImageIds: ['ai_ref', 'ai_ref2'],
      referenceImageIdsEffective: ['ai_ref'],
    })
    callVLMMultiMock.mockResolvedValue(JSON.stringify({ consistent: true, issues: [], summary: 'ok' }))

    await svc.reviewKeyframe(kfId)
    const imgs = callVLMMultiMock.mock.calls[0][1] as string[]
    // kf 本体 + 仅生效的 1 张参考图
    expect(imgs).toHaveLength(2)
  })

  it('老数据无 referenceImageIdsEffective → 回退 referenceImageIds', async () => {
    const { kfId } = await seed(ds, {
      subType: 'storyboard_keyframe',
      storyboardId: 'sb1',
      referenceImageIds: ['ai_ref'],
    })
    callVLMMultiMock.mockResolvedValue(JSON.stringify({ consistent: true, issues: [], summary: 'ok' }))

    await svc.reviewKeyframe(kfId)
    const imgs = callVLMMultiMock.mock.calls[0][1] as string[]
    expect(imgs).toHaveLength(2)
  })

  it('无图关键帧 → 抛错；整分镜校验跳过无图帧不中断', async () => {
    const { kfId } = await seed(ds)
    // 加一帧无图关键帧
    await ds.getRepository(StoryboardKeyframeEntity).save({
      id: 'kf_empty',
      storyboardId: 'sb1',
      frameIndex: 1,
      timePercent: 0.5,
      frameRole: 'middle',
      imageAssetId: null,
      derivedFromKeyframeId: null,
      prompt: null,
      negativePrompt: null,
      userPromptOverride: null,
      referenceOverrides: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    callVLMMultiMock.mockResolvedValue(JSON.stringify({ consistent: true, issues: [], summary: 'ok' }))

    const results = await svc.reviewStoryboardKeyframes('sb1')
    expect(results).toHaveLength(2)
    const empty = results.find(r => r.keyframeId === 'kf_empty')
    expect(empty?.review).toBeNull()
    expect(empty?.error).toContain('未生成图片')
    const ok = results.find(r => r.keyframeId === kfId)
    expect(ok?.review?.status).toBe('pass')
  })

  it('关键帧不存在 → 抛错', async () => {
    await expect(svc.reviewKeyframe('kf_ghost')).rejects.toThrow(/Keyframe not found/)
  })

  // ─── E2（2026-09-21）：审核模型多模态判定 + 纯文本模型跳过 ───

  it('E2：显式指定纯文本审核模型 → 跳过 VLM，落 skipped', async () => {
    const { kfId, iaId } = await seed(ds)
    const review = await svc.reviewKeyframe(kfId, { modelId: 'qwen3.8-27b' })
    expect(review.status).toBe('skipped')
    expect(review.summary).toContain('非多模态')
    // 纯文本模型不发 VLM 调用
    expect(callVLMMultiMock).not.toHaveBeenCalled()
    const ia = await new ImageAssetRepository(ds).getById(iaId)
    expect((ia?.metadata as any)?.review?.status).toBe('skipped')
  })

  it('E2：显式指定多模态模型（qwen-vl-max）→ 正常调 VLM', async () => {
    const { kfId } = await seed(ds)
    callVLMMultiMock.mockResolvedValue(JSON.stringify({ consistent: true, issues: [], summary: 'ok' }))
    const review = await svc.reviewKeyframe(kfId, { modelId: 'qwen-vl-max' })
    expect(review.status).toBe('pass')
    expect(callVLMMultiMock).toHaveBeenCalledTimes(1)
  })

  it('E2：VLM 返回"无法读取图像"类结论 → 视同 skipped（纯文本模型无效结论）', async () => {
    const { kfId } = await seed(ds)
    callVLMMultiMock.mockResolvedValue(JSON.stringify({
      consistent: false,
      issues: ['无法读取图像内容，无法核验人物一致性'],
      summary: '无法读取图像',
    }))
    const review = await svc.reviewKeyframe(kfId)
    expect(review.status).toBe('skipped')
    expect(review.summary).toContain('按跳过处理')
  })
})

describe('isVisionCapable（E2 审核模型多模态判定）', () => {
  it('多模态关键词命中', async () => {
    const { isVisionCapable } = await import(
      '@core/platform/episode-production/render/keyframe/keyframe-review.service'
    )
    expect(isVisionCapable('qwen-vl-max')).toBe(true)
    expect(isVisionCapable('qwen2.5-vl-72b')).toBe(true)
    expect(isVisionCapable('gpt-4o')).toBe(true)
    expect(isVisionCapable('gemini-2.5-pro')).toBe(true)
    expect(isVisionCapable('claude-sonnet-4')).toBe(true)
    expect(isVisionCapable('llava-vision-v1')).toBe(true)
  })

  it('纯文本/未指定 → false', async () => {
    const { isVisionCapable } = await import(
      '@core/platform/episode-production/render/keyframe/keyframe-review.service'
    )
    expect(isVisionCapable('qwen3.8-27b')).toBe(false)
    expect(isVisionCapable('deepseek-v3')).toBe(false)
    expect(isVisionCapable('gpt-3.5-turbo')).toBe(false)
    expect(isVisionCapable('')).toBe(false)
    expect(isVisionCapable(null)).toBe(false)
    expect(isVisionCapable(undefined)).toBe(false)
  })
})
