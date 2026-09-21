/**
 * KeyframeGenerationService 重拍闭环 + 编号参考板单测（2026-09-21 · D/E2）
 *
 * - E2 重拍闭环：机器校验 fail → prompt 追加"上一张图的问题"重拍，最多 3 张；
 *   全部失败 → metadata.machineCheck.pass=false 落库（不再静默通过），帧行仍创建
 * - 审核模型未配置/非多模态 → review.status='skipped'（不假装审过）
 * - D 拼板：钉住 comfyui/flux-kontext（maxReferenceImages=1）+ 2 张参考图 →
 *   拼编号参考板作为唯一参考图，prompt 前置编号对照，metadata.referenceBoard 落库，
 *   referenceImageIdsEffective 仍记原始成员 ids
 * - 多图模型（seedream maxReferenceImages=14）→ 不拼板，原多参考图直通
 *
 * 生成图/参考图用 sharp 现场生成的真实小图（机器校验需要真文件）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import sharp from 'sharp'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { LwLocationEntity } from '@core/database/entities/lw-location.entity'
import { LwItemEntity } from '@core/database/entities/lw-item.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { StoryboardCharacterEntity } from '@core/database/entities/episode-production/storyboard-character.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { KeyframeGenerationService } from '@core/platform/episode-production/render/keyframe/keyframe-generation.service'
import { ReferenceBoardService } from '@core/platform/episode-production/render/keyframe/reference-board.service'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import * as dbModule from '@core/database/database-manager.interface'

let tmpDir: string

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      CharacterBindingEntity,
      LocationBindingEntity,
      ItemBindingEntity,
      AssetImageEntity,
      LwCharacterEntity,
      LwLocationEntity,
      LwItemEntity,
      SceneScriptEntity,
      EpisodeScriptEntity,
      VideoEpisodeEntity,
      VideoProjectEntity,
      StoryboardEntity,
      StoryboardKeyframeEntity,
      StoryboardCharacterEntity,
      ImageAssetEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

/** 噪点正常图（机器校验 pass） */
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

/** 纯色坏图（机器校验 flat_or_blank fail） */
async function makeFlatImage(file: string): Promise<void> {
  await sharp({ create: { width: 64, height: 64, channels: 3, background: '#336699' } })
    .png()
    .toFile(file)
}

async function seedScene(ds: DataSource): Promise<{ sbId: string }> {
  // 资产参考图用真实文件（拼板 / 机器校验需要读图）
  const charImg = path.join(tmpDir, 'cb1.png')
  const locImg = path.join(tmpDir, 'lb1.png')
  await makeNoiseImage(charImg, 11)
  await makeNoiseImage(locImg, 77)

  await ds.getRepository(CharacterBindingEntity).save({
    id: 'cb1',
    projectId: 'proj1',
    longWritingCharacterId: null,
    sourceType: 'standalone',
    voiceConfig: {},
    standaloneName: '张三',
    standaloneDescription: '客人',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  await ds.getRepository(LocationBindingEntity).save({
    id: 'lb1',
    projectId: 'proj1',
    longWritingLocationId: null,
    sourceType: 'standalone',
    locationName: '茶馆',
    standaloneName: '茶馆',
    standaloneDescription: '老式茶馆',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  await ds.getRepository(AssetImageEntity).save([
    {
      id: 'ai_loc',
      assetType: 'location',
      assetId: 'lb1',
      category: 'main',
      imagePath: locImg,
      isMain: 1,
      confirmed: 1,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'ai_char',
      assetType: 'character',
      assetId: 'cb1',
      category: 'main',
      imagePath: charImg,
      isMain: 1,
      confirmed: 1,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ] as any)

  await ds.getRepository(VideoEpisodeEntity).save({
    id: 'ep1',
    projectId: 'proj1',
    episodeNumber: 1,
    title: '测试剧集',
    sourceType: 'uploaded',
    status: 'producing',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  await ds.getRepository(EpisodeScriptEntity).save({
    id: 'es1',
    projectId: 'proj1',
    episodeId: 'ep1',
    outlineId: '',
    status: 'approved',
    synopsis: '',
    totalDuration: 0,
    characterAppearances: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  await ds.getRepository(SceneScriptEntity).save({
    id: 's1',
    episodeScriptId: 'es1',
    sceneNumber: 1,
    location: '茶馆',
    locationBindingId: 'lb1',
    locationType: 'interior',
    timeOfDay: 'morning',
    weather: 'sunny',
    sceneDescription: '清晨茶馆',
    mood: '安静',
    lighting: null,
    characters: [
      {
        characterBindingId: 'cb1',
        characterId: 'lwc-x',
        characterName: '张三',
        position: 'center',
        expression: '凝重',
        action: '推门',
        outfit: '蓝色长衫',
      },
    ],
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
    status: 'pending',
    keyframeCount: 1,
    videoProviderId: null,
    videoModelId: null,
    videoMode: null,
    use3dStaging: 0,
    stagingLayoutId: null,
    backgroundRefImageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  return { sbId: 'sb1' }
}

describe('KeyframeGenerationService 重拍闭环 + 参考板', () => {
  let ds: DataSource
  let imageGen: { generate: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    ds = await buildDb()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-retake-'))
    imageGen = { generate: vi.fn() }
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (ds.isInitialized) await ds.destroy()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('E2：前两张纯色坏图 → 第三张好图；重拍 prompt 带"上一张图的问题"', async () => {
    const { sbId } = await seedScene(ds)
    const flat = path.join(tmpDir, 'flat.png')
    const good = path.join(tmpDir, 'good.png')
    await makeFlatImage(flat)
    await makeNoiseImage(good, 5)
    let n = 0
    imageGen.generate.mockImplementation(async () => {
      n += 1
      return { imagePath: n < 3 ? flat : good, thumbnailPath: null }
    })

    const svc = new KeyframeGenerationService(ds, imageGen as any)
    const result = await svc.generateKeyframesForStoryboard({
      storyboardId: sbId,
      keyframeCountOverride: 1,
    })

    expect(result).toHaveLength(1)
    expect(imageGen.generate).toHaveBeenCalledTimes(3)
    const prompts = imageGen.generate.mock.calls.map((c) => (c[0] as any).prompt as string)
    expect(prompts[0]).not.toContain('上一张图的问题')
    expect(prompts[1]).toContain('上一张图的问题')
    expect(prompts[1]).toContain('纯色')
    expect(prompts[2]).toContain('上一张图的问题')

    // 最终帧落库：machineCheck pass；审核模型未配置 → review skipped
    const ia = await new ImageAssetRepository(ds).getById(result[0].imageAssetId!)
    expect((ia?.metadata as any)?.machineCheck?.pass).toBe(true)
    expect((ia?.metadata as any)?.review?.status).toBe('skipped')
  })

  it('E2：三张全坏 → machineCheck.pass=false 落库（不再静默通过），帧行仍创建', async () => {
    const { sbId } = await seedScene(ds)
    const flat = path.join(tmpDir, 'flat.png')
    await makeFlatImage(flat)
    imageGen.generate.mockImplementation(async () => ({ imagePath: flat, thumbnailPath: null }))

    const svc = new KeyframeGenerationService(ds, imageGen as any)
    const result = await svc.generateKeyframesForStoryboard({
      storyboardId: sbId,
      keyframeCountOverride: 1,
    })

    expect(result).toHaveLength(1)
    // 首拍 + 2 次重拍 = 3 张，上限封顶
    expect(imageGen.generate).toHaveBeenCalledTimes(3)
    const ia = await new ImageAssetRepository(ds).getById(result[0].imageAssetId!)
    const meta = ia?.metadata as any
    expect(meta?.machineCheck?.pass).toBe(false)
    expect(meta?.machineCheck?.failures?.[0]?.code).toBe('flat_or_blank')
    // 机器校验未过 → 未进 VLM，review 记 skipped
    expect(meta?.review?.status).toBe('skipped')
  })

  it('D：钉住单图模型（comfyui/flux-kontext）+ 2 张参考图 → 拼编号参考板', async () => {
    const { sbId } = await seedScene(ds)
    await ds.getRepository(VideoProjectEntity).save({
      id: 'proj1',
      name: 'p',
      status: 'draft',
      config: { imageModel: { providerConfigId: 'pc_comfy', modelId: 'flux-kontext' } },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any)
    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      providerConfigs: {
        getEnabled: vi.fn(async () => [
          {
            id: 'pc_comfy',
            templateId: 'comfyui',
            isEnabled: true,
            models: [
              { id: 'krea2', name: 'Krea2 文生图', type: 'image' },
              { id: 'flux-kontext', name: 'Flux Kontext 参考图生图', type: 'image' },
            ],
          },
        ]),
      },
    } as any)

    const good = path.join(tmpDir, 'good.png')
    await makeNoiseImage(good, 5)
    imageGen.generate.mockImplementation(async () => ({ imagePath: good, thumbnailPath: null }))

    const svc = new KeyframeGenerationService(ds, imageGen as any, {
      boardService: new ReferenceBoardService(() => tmpDir),
    })
    const result = await svc.generateKeyframesForStoryboard({
      storyboardId: sbId,
      keyframeCountOverride: 1,
    })

    expect(imageGen.generate).toHaveBeenCalledTimes(1)
    const call = imageGen.generate.mock.calls[0][0] as any
    // 唯一参考图 = 拼板
    expect(call.referenceImagePaths).toHaveLength(1)
    expect(call.referenceImagePaths[0]).toMatch(/board_.+\.png$/)
    // 拼板产物真实存在（注入的临时 dataPath 下）
    expect(fs.existsSync(path.join(tmpDir, call.referenceImagePaths[0]))).toBe(true)
    // prompt 前置编号对照说明
    expect(call.prompt).toContain('编号参考板')
    expect(call.prompt).toContain('1号=张三（角色）')
    expect(call.prompt).toContain('2号=茶馆（场景）')

    const ia = await new ImageAssetRepository(ds).getById(result[0].imageAssetId!)
    const meta = ia?.metadata as any
    // referenceBoard 落库：members 顺序/编号
    expect(meta?.referenceBoard?.members).toEqual([
      { assetImageId: 'ai_char', name: '张三', kind: 'character', slot: 1 },
      { assetImageId: 'ai_loc', name: '茶馆', kind: 'location', slot: 2 },
    ])
    // effective ids 仍记原始成员（不是拼板）
    expect(meta?.referenceImageIdsEffective).toEqual(['ai_char', 'ai_loc'])
  })

  it('D：多图模型（volcengine/seedream-4，maxReferenceImages=14）→ 不拼板原样直通', async () => {
    const { sbId } = await seedScene(ds)
    await ds.getRepository(VideoProjectEntity).save({
      id: 'proj1',
      name: 'p',
      status: 'draft',
      config: { imageModel: { providerConfigId: 'pc_volc', modelId: 'seedream-4-5' } },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any)
    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      providerConfigs: {
        getEnabled: vi.fn(async () => [
          {
            id: 'pc_volc',
            templateId: 'volcengine',
            isEnabled: true,
            models: [{ id: 'seedream-4-5', name: 'Seedream 4.5', type: 'image' }],
          },
        ]),
      },
    } as any)

    const good = path.join(tmpDir, 'good.png')
    await makeNoiseImage(good, 5)
    imageGen.generate.mockImplementation(async () => ({ imagePath: good, thumbnailPath: null }))

    const svc = new KeyframeGenerationService(ds, imageGen as any, {
      boardService: new ReferenceBoardService(() => tmpDir),
    })
    const result = await svc.generateKeyframesForStoryboard({
      storyboardId: sbId,
      keyframeCountOverride: 1,
    })

    const call = imageGen.generate.mock.calls[0][0] as any
    // 原始 2 张参考图直通（角色 → 地点顺序）
    expect(call.referenceImagePaths).toHaveLength(2)
    expect(call.referenceImagePaths[0]).toContain('cb1.png')
    expect(call.prompt).not.toContain('编号参考板')

    const ia = await new ImageAssetRepository(ds).getById(result[0].imageAssetId!)
    expect((ia?.metadata as any)?.referenceBoard).toBeUndefined()
  })
})
