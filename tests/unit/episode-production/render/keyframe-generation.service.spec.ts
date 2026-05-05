/**
 * KeyframeGenerationService 集成单测（P5-T4）
 *
 * 用 in-memory sqlite + mock ImageGenerator 串联：
 *   plan → ref-selector → prompt-builder → image-gen mock → image_assets + storyboard_keyframe
 *
 * 验证：
 * - 3 帧生成产出 3 行 storyboard_keyframe（按 plan 顺序：start/end/middle）+ 3 行 image_assets
 * - keyframe.imageAssetId 正确指向新建的 image_assets
 * - keyframe.prompt 含资产引用 + 时刻语言
 * - regenerateKeyframe 单独重生成单帧（id 换新，frameIndex 保持）
 * - listKeyframes 顺序正确
 * - 缺 storyboard / scene 抛错
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { LwLocationEntity } from '@core/database/entities/lw-location.entity'
import { LwItemEntity } from '@core/database/entities/lw-item.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { KeyframeGenerationService } from '@core/modules/episode-production/render/keyframe/keyframe-generation.service'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import { StoryboardKeyframeRepository } from '@core/database/repositories/storyboard-keyframe.repository'

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
      StoryboardEntity,
      StoryboardKeyframeEntity,
      ImageAssetEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedScene(ds: DataSource): Promise<{ sceneId: string; sbId: string }> {
  // 资产 + 主图
  await ds.getRepository(CharacterBindingEntity).save({
    id: 'cb1',
    projectId: 'p1',
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
    projectId: 'p1',
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
      imagePath: '/tmp/lb1.png',
      isMain: 1,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'ai_char',
      assetType: 'character',
      assetId: 'cb1',
      category: 'main',
      imagePath: '/tmp/cb1.png',
      isMain: 1,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ] as any)

  // 场景 + 分镜
  const sceneId = 's1'
  await ds.getRepository(SceneScriptEntity).save({
    id: sceneId,
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

  const sbId = 'sb1'
  await ds.getRepository(StoryboardEntity).save({
    id: sbId,
    sceneScriptId: sceneId,
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
    keyframeCount: 3,
    videoProviderId: null,
    videoModelId: null,
    videoMode: null,
    use3dStaging: 0,
    stagingLayoutId: null,
    backgroundRefImageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)

  return { sceneId, sbId }
}

describe('KeyframeGenerationService', () => {
  let ds: DataSource
  let svc: KeyframeGenerationService
  let imageGen: { generate: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    ds = await buildDb()
    let counter = 0
    imageGen = {
      generate: vi.fn(async (_opts: any) => {
        counter += 1
        return {
          imagePath: `/tmp/generated_${counter}.png`,
          thumbnailPath: null,
        }
      }),
    }
    svc = new KeyframeGenerationService(ds, imageGen as any)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('3 帧生成：按 plan 顺序产出 3 行 keyframe + 3 行 image_assets', async () => {
    const { sbId } = await seedScene(ds)
    const result = await svc.generateKeyframesForStoryboard({ storyboardId: sbId })

    expect(result).toHaveLength(3)
    // plan 顺序为 start → end → middle，frameIndex 应分别是 0, 2, 1
    expect(result.map((k) => k.frameIndex)).toEqual([0, 2, 1])
    expect(result.map((k) => k.frameRole)).toEqual(['start', 'end', 'middle'])

    // keyframeRepo 列出来按 frame_index 升序
    const list = await new StoryboardKeyframeRepository(ds).listByStoryboard(sbId)
    expect(list.map((k) => k.frameIndex)).toEqual([0, 1, 2])

    // image_assets 表写了 3 行（projectId 来自 scene → episode_script → episode 反查；
    // 测试 seed 中 episode_script / video_episodes 不存在 → 回落 'unknown'）
    const ias = await ds
      .getRepository(ImageAssetEntity)
      .find()
    expect(ias).toHaveLength(3)
    // 每行 metadata 含 subType
    for (const ia of ias) {
      expect(ia.metadata?.subType).toBe('storyboard_keyframe')
    }

    // imageGenerator 被调 3 次
    expect(imageGen.generate).toHaveBeenCalledTimes(3)
    // 每次调用的 prompt 含资产引用 + 时刻语言
    for (const call of imageGen.generate.mock.calls) {
      const opts = call[0] as { prompt: string; label: string }
      expect(opts.prompt).toContain('张三')
      expect(opts.prompt).toContain('茶馆')
      expect(opts.label).toMatch(/^keyframe_(start|middle|end)_\d+$/)
    }
  })

  it('keyframe.imageAssetId 指向新建的 image_assets', async () => {
    const { sbId } = await seedScene(ds)
    const result = await svc.generateKeyframesForStoryboard({ storyboardId: sbId })

    for (const kf of result) {
      expect(kf.imageAssetId).toBeTruthy()
      const ia = await new ImageAssetRepository(ds).getById(kf.imageAssetId!)
      expect(ia).not.toBeNull()
      expect(ia?.imagePath).toMatch(/^\/tmp\/generated_\d+\.png$/)
    }
  })

  it('keyframe.prompt 含时刻语言（start/middle/end 区分）', async () => {
    const { sbId } = await seedScene(ds)
    const result = await svc.generateKeyframesForStoryboard({ storyboardId: sbId })

    const start = result.find((k) => k.frameRole === 'start')
    const middle = result.find((k) => k.frameRole === 'middle')
    const end = result.find((k) => k.frameRole === 'end')

    expect(start?.prompt).toContain('开始时刻')
    expect(end?.prompt).toContain('结束时刻')
    expect(middle?.prompt).toContain('50%')
  })

  it('regenerateKeyframe：单帧重生成（id 换新，frameIndex 保留）', async () => {
    const { sbId } = await seedScene(ds)
    const all = await svc.generateKeyframesForStoryboard({ storyboardId: sbId })
    const oldStart = all.find((k) => k.frameRole === 'start')!

    const newStart = await svc.regenerateKeyframe({ keyframeId: oldStart.id })
    expect(newStart.id).not.toBe(oldStart.id)
    expect(newStart.frameIndex).toBe(0)
    expect(newStart.frameRole).toBe('start')

    // 列表仍有 3 帧，旧 id 应不存在
    const list = await svc.listKeyframes(sbId)
    expect(list).toHaveLength(3)
    expect(list.find((k) => k.id === oldStart.id)).toBeUndefined()
  })

  it('storyboard 不存在抛错', async () => {
    await expect(
      svc.generateKeyframesForStoryboard({ storyboardId: 'sb_ghost' }),
    ).rejects.toThrow(/Storyboard not found/)
  })

  it('keyframeCountOverride 改变生成数量', async () => {
    const { sbId } = await seedScene(ds)
    const result = await svc.generateKeyframesForStoryboard({
      storyboardId: sbId,
      keyframeCountOverride: 2,
    })
    expect(result).toHaveLength(2)
    expect(result.map((k) => k.frameRole)).toEqual(['start', 'end'])
  })
})
