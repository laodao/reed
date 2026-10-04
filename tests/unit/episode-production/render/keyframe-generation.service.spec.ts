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
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
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
import { KeyframeReviewService } from '@core/platform/episode-production/render/keyframe/keyframe-review.service'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import { StoryboardKeyframeRepository } from '@core/database/repositories/storyboard-keyframe.repository'
import * as dbModule from '@core/database/database-manager.interface'

/*
 * 合成锚定（2026-09-21 设计转向）：多角色锚定走 T2I 草稿 → sharp 贴人 → kontext 融合。
 * 单测不起真实 sharp 子进程，mock 掉贴图步；合成产物不落盘（机器校验对缺失文件降级放行）。
 */
vi.mock('@core/platform/episode-production/common/sharp-worker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/platform/episode-production/common/sharp-worker')>()
  return {
    ...actual,
    workerCompositeOntoScene: vi.fn(
      async (args: { members: Array<{ assetImageId: string; name: string }> }) => ({
        members: args.members.map((m, i) => ({ assetImageId: m.assetImageId, name: m.name, slot: i + 1 })),
      }),
    ),
  }
})

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

async function seedScene(ds: DataSource): Promise<{ sceneId: string; sbId: string }> {
  // 资产 + 主图
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
      imagePath: '/tmp/lb1.png',
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
      imagePath: '/tmp/cb1.png',
      isMain: 1,
      confirmed: 1,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ] as any)

  // 项目 + 剧集 + 剧本（resolveProjectIdForScene 链路 seed）
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
    vi.restoreAllMocks()
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

  it('2026-09-19：项目「画面生成」模型（config.imageModel）透传给图像生成', async () => {
    const { sbId } = await seedScene(ds)
    await ds.getRepository(VideoProjectEntity).save({
      id: 'proj1',
      name: 'p',
      status: 'draft',
      config: { imageModel: { providerConfigId: 'pc_img', modelId: 'wan2.7-image' } },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any)

    await svc.generateKeyframesForStoryboard({ storyboardId: sbId })

    expect(imageGen.generate).toHaveBeenCalledTimes(3)
    for (const call of imageGen.generate.mock.calls) {
      const opts = call[0] as { providerConfigId?: string; modelId?: string }
      expect(opts.providerConfigId).toBe('pc_img')
      expect(opts.modelId).toBe('wan2.7-image')
    }
  })

  /*
   * F1b（2026-09-21）：关键帧带参考图时，钉住的模型不支持参考图
   * （comfyui/krea2 maxReferenceImages=0）→ 回退同 provider 的 flux-kontext。
   * 合成锚定设计转向后：草稿步用同 provider 的 T2I（krea2），融合步用回退后的
   * flux-kontext（唯一参考图 = 合成图）——每帧 2 次生成，3 帧共 6 次。
   */
  it('F1b：关键帧钉住 krea2（不支持参考图）→ 草稿 krea2 + 融合回退 flux-kontext', async () => {
    const { sbId } = await seedScene(ds)
    await ds.getRepository(VideoProjectEntity).save({
      id: 'proj1',
      name: 'p',
      status: 'draft',
      config: { imageModel: { providerConfigId: 'pc_comfy', modelId: 'krea2' } },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any)
    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      providerConfigs: {
        getEnabled: vi.fn(async () => [{
          id: 'pc_comfy',
          templateId: 'comfyui',
          isEnabled: true,
          models: [
            { id: 'h3', name: 'MiniMax-H3 图生视频', type: 'video' },
            { id: 'krea2', name: 'Krea2 文生图', type: 'image' },
            { id: 'flux-kontext', name: 'Flux Kontext 参考图生图', type: 'image' },
          ],
        }]),
      },
    } as any)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-f1b-'))
    svc = new KeyframeGenerationService(ds, imageGen as any, { compositeDataPath: () => tmpDir })

    await svc.generateKeyframesForStoryboard({ storyboardId: sbId })

    // 每帧：草稿（krea2，无参考图）→ 融合（flux-kontext，唯一参考图=合成图）
    expect(imageGen.generate).toHaveBeenCalledTimes(6)
    const calls = imageGen.generate.mock.calls.map(
      (c) => c[0] as { providerConfigId?: string; modelId?: string; referenceImagePaths: string[]; prompt: string },
    )
    for (let i = 0; i < calls.length; i += 2) {
      const draft = calls[i]
      const fusion = calls[i + 1]
      expect(draft.providerConfigId).toBe('pc_comfy')
      expect(draft.modelId).toBe('krea2')
      expect(draft.referenceImagePaths).toHaveLength(0)
      expect(fusion.providerConfigId).toBe('pc_comfy')
      expect(fusion.modelId).toBe('flux-kontext')
      expect(fusion.referenceImagePaths).toHaveLength(1)
      expect(fusion.referenceImagePaths[0]).toMatch(/composite_.+\.png$/)
      expect(fusion.prompt).toContain('合成锚定融合')
    }
  })

  it('2026-09-19：生效参考图截断落库（referenceImageIdsEffective ⊂ referenceImageIds）', async () => {
    const { sbId } = await seedScene(ds)
    // 模拟单图模型：adapter 截断后只有角色图生效（地点图被丢弃）
    imageGen.generate.mockImplementation(async (_opts: any) => ({
      imagePath: '/tmp/generated_x.png',
      thumbnailPath: null,
      resolvedModel: { providerConfigId: 'pc_img', modelId: 'wan2.7-image' },
      effectiveReferencePaths: ['/tmp/cb1.png'],
    }))

    await svc.generateKeyframesForStoryboard({ storyboardId: sbId })

    const ias = await ds.getRepository(ImageAssetEntity).find()
    expect(ias).toHaveLength(3)
    for (const ia of ias) {
      // 选中 2 张（角色 + 地点兜底主图），生效只有角色 1 张
      expect(ia.metadata?.referenceImageIds).toEqual(['ai_char', 'ai_loc'])
      expect(ia.metadata?.referenceImageIdsEffective).toEqual(['ai_char'])
      expect(ia.metadata?.resolvedModel).toEqual({ providerConfigId: 'pc_img', modelId: 'wan2.7-image' })
    }
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

  it('F5：关键帧全部生成成功 → storyboard.status 写回 image_ready', async () => {
    const { sbId } = await seedScene(ds)
    await svc.generateKeyframesForStoryboard({ storyboardId: sbId })

    const sb = await ds.getRepository(StoryboardEntity).findOne({ where: { id: sbId } })
    expect(sb?.status).toBe('image_ready')
  })

  it('F5：关键帧生成中途失败 → storyboard.status 写回 error 且继续抛错', async () => {
    const { sbId } = await seedScene(ds)
    imageGen.generate.mockRejectedValueOnce(new Error('image provider boom'))

    await expect(
      svc.generateKeyframesForStoryboard({ storyboardId: sbId }),
    ).rejects.toThrow(/image provider boom/)

    const sb = await ds.getRepository(StoryboardEntity).findOne({ where: { id: sbId } })
    expect(sb?.status).toBe('error')
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

  /**
   * P5-T31 spec §4.5.3：storyboard_characters 表有数据时优先用分镜级
   * 配置（覆盖 scene.characters JSON 的场景级配置）。
   *
   * 验证：seedScene 写 scene.characters=[{cb1, expression='neutral'}]，
   * 同时往 storyboard_characters 表写 {storyboardId=sbId, characterId=cb1,
   * expression='angry'} → 生成的 prompt 应含 'angry'，不含 'neutral'。
   */
  it('P5-T31 spec §4.5.3：storyboard_characters 表存在时覆盖 scene 级', async () => {
    const { sbId } = await seedScene(ds)

    // 在 storyboard_characters 表写分镜级独立配置（angry 表情）
    await ds.getRepository(StoryboardCharacterEntity).save({
      id: 'sbc1',
      storyboardId: sbId,
      characterId: 'cb1',
      positionX: 50,
      positionY: 50,
      positionScale: 1.0,
      expression: 'angry',
      action: '怒指对方',
      facing: 'front',
      sortOrder: 0,
    })

    const result = await svc.generateKeyframesForStoryboard({
      storyboardId: sbId,
      keyframeCountOverride: 1,
    })
    expect(result).toHaveLength(1)
    const prompt = result[0].prompt ?? ''
    expect(prompt).toContain('angry')
    expect(prompt).toContain('怒指对方')
    expect(prompt).not.toContain('neutral') // scene 级 expression 不应进入
  })

  /**
   * P5-T31 回退兜底：storyboard_characters 表无数据时走 scene.characters JSON。
   */
  it('P5-T31 兜底：storyboard_characters 空时回退到 scene.characters JSON', async () => {
    const { sbId } = await seedScene(ds)
    // 不往 storyboard_characters 写 → 走回退路径

    const result = await svc.generateKeyframesForStoryboard({
      storyboardId: sbId,
      keyframeCountOverride: 1,
    })
    expect(result).toHaveLength(1)
    const prompt = result[0].prompt ?? ''
    // seedScene 在 scene.characters 写了 expression='凝重' + action='推门'
    expect(prompt).toContain('凝重')
    expect(prompt).toContain('推门')
    // 验证没有"angry"（覆盖测试中分镜级用 angry，本测试不写分镜级所以不应该出现）
    expect(prompt).not.toContain('angry')
  })

  /**
   * Bug B 修复（spec 2026-05-09 ep-redesign · e2e report-shot-1.2.md）：
   *
   * 当 storyboard_characters 表为空 + storyboard.characters JSON 非空时，
   * 应**优先用 storyboard.characters JSON 字段**（本分镜级配置），不应回退
   * 到 scene.characters（整场所有角色）。
   *
   * 旧 bug：分镜 1.2 storyboard.characters JSON 只有李墨，但 fallback 跳过
   * 直接用整场 scene.characters（李墨 + 苏白 + 茶博士），导致关键帧 prompt
   * 错误包含本分镜根本不出现的角色，AI 生成的画面与剧本不符。
   */
  it('Bug B：storyboard.characters JSON 非空时优先于 scene.characters', async () => {
    const { sbId, sceneId } = await seedScene(ds)

    // 给 scene.characters 加入第二个角色（整场有两人）
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb2',
      projectId: 'proj1',
      longWritingCharacterId: null,
      sourceType: 'standalone',
      voiceConfig: {},
      standaloneName: '李四',
      standaloneDescription: '神秘客',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(AssetImageEntity).save({
      id: 'ai_char2',
      assetType: 'character',
      assetId: 'cb2',
      category: 'main',
      imagePath: '/tmp/cb2.png',
      isMain: 1,
      confirmed: 1,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(SceneScriptEntity).update(
      { id: sceneId },
      {
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
          {
            characterBindingId: 'cb2',
            characterId: 'lwc-y',
            characterName: '李四',
            position: 'right',
            expression: '冷漠',
            action: '靠墙',
            outfit: '黑色斗篷',
          },
        ] as any,
      },
    )

    // storyboard.characters JSON 只含 cb1（本分镜只一人出场）
    await ds.getRepository(StoryboardEntity).update(
      { id: sbId },
      {
        characters: [
          {
            characterId: 'cb1',
            position: { x: 65, y: 55, scale: 1.1 },
            expression: '焦虑不安',
            action: '摩挲玉佩',
            facing: 'left',
          },
        ] as any,
      },
    )

    const result = await svc.generateKeyframesForStoryboard({
      storyboardId: sbId,
      keyframeCountOverride: 1,
    })
    expect(result).toHaveLength(1)
    const prompt = result[0].prompt ?? ''

    // 必须含本分镜的角色 cb1 + 本分镜级 expression/action
    expect(prompt).toContain('张三')
    expect(prompt).toContain('焦虑不安')
    expect(prompt).toContain('摩挲玉佩')

    // 关键断言：不含整场另一角色 cb2 / 李四 / 冷漠 / 靠墙
    expect(prompt).not.toContain('李四')
    expect(prompt).not.toContain('冷漠')
    expect(prompt).not.toContain('靠墙')
  })

  /**
   * Bug B 配套：storyboard.characters JSON 中 characterId 是 standaloneName
   * 时（AI 拆分镜常用名字而非 binding.id），按名字反查 character_bindings。
   */
  it('Bug B：storyboard.characters JSON 用角色名时按 standaloneName 反查', async () => {
    const { sbId } = await seedScene(ds)

    // storyboard.characters 用名字"张三"（不是 binding.id "cb1"）
    await ds.getRepository(StoryboardEntity).update(
      { id: sbId },
      {
        characters: [
          {
            characterId: '张三',
            position: { x: 50, y: 50, scale: 1 },
            expression: '惊愕',
            action: '后退',
            facing: 'front',
          },
        ] as any,
      },
    )

    const result = await svc.generateKeyframesForStoryboard({
      storyboardId: sbId,
      keyframeCountOverride: 1,
    })
    const prompt = result[0].prompt ?? ''
    // 应通过名字反查到 cb1，prompt 含张三 + 本分镜表情/动作（不是 scene 级的）
    expect(prompt).toContain('张三')
    expect(prompt).toContain('惊愕 expression')
    expect(prompt).toContain('后退')
    // 不应含 scene.characters 级 expression（凝重）
    // 注：'推门' 出现在 storyboard.frameDescription 是正常的（画面描述 ≠ 角色动作）
    expect(prompt).not.toContain('凝重 expression')
  })

  /**
   * D4-3 空绑定守卫（tasks/2026-09-16-storyboard-asset-cogen）：
   * storyboard.characters JSON 中 characterId 全为空字符串（e2e 实测分镜 1.2 的
   * 真实数据，F1/F2 形态）→ 单条无法 resolve、也不回退 scene.characters 整场，
   * 场景名单有角色但解析结果为空 → 直接报错拒绝生成，不再纯文生图静默降级。
   * （本用例取代原"Bug B：静默跳过"断言——回退不触发的事实不变，
   *   但行为从静默降级升级为显式失败。）
   */
  it('D4-3：场景有角色但无任何可解析绑定 → 拒绝生成', async () => {
    const { sbId, sceneId } = await seedScene(ds)

    // scene.characters 加第二个角色
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb2',
      projectId: 'proj1',
      longWritingCharacterId: null,
      sourceType: 'standalone',
      voiceConfig: {},
      standaloneName: '李四',
      standaloneDescription: '神秘客',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(SceneScriptEntity).update(
      { id: sceneId },
      {
        characters: [
          {
            characterBindingId: 'cb1',
            characterId: 'lwc-x',
            characterName: '张三',
            expression: '凝重',
            action: '推门',
          },
          {
            characterBindingId: 'cb2',
            characterId: 'lwc-y',
            characterName: '李四',
            expression: '冷漠',
            action: '靠墙',
          },
        ] as any,
      },
    )

    // storyboard.characters JSON 唯一一条 characterId="" 空字符串
    await ds.getRepository(StoryboardEntity).update(
      { id: sbId },
      {
        characters: [
          {
            characterId: '',
            position: { x: 65, y: 55, scale: 1 },
            expression: '焦虑',
            action: '摩挲玉佩',
            facing: 'left',
          },
        ] as any,
      },
    )

    await expect(
      svc.generateKeyframesForStoryboard({
        storyboardId: sbId,
        keyframeCountOverride: 1,
      }),
    ).rejects.toThrow(/角色未绑定资产/)
  })

  /**
   * S-05 影响面统计口径：
   * - keyframes：storyboard_keyframe.reference_overrides LIKE 含 bindingId 的行
   * - storyboards：storyboards.characters JSON LIKE 含 bindingId 的分镜数（character）
   */
  it('S-05 countAssetReferences：referenceOverrides + storyboards.characters 双口径', async () => {
    const { sbId } = await seedScene(ds)
    const all = await svc.generateKeyframesForStoryboard({ storyboardId: sbId })
    expect(all).toHaveLength(3)

    // 两帧用户挑图引用 cb1；另一帧引用 lb1
    await svc.setReferenceOverrides(all[0].id, [
      { kind: 'character', bindingId: 'cb1', imageId: 'ai_char' },
    ])
    await svc.setReferenceOverrides(all[1].id, [
      { kind: 'character', bindingId: 'cb1', imageId: 'ai_char' },
    ])
    await svc.setReferenceOverrides(all[2].id, [
      { kind: 'location', bindingId: 'lb1', imageId: 'ai_loc' },
    ])
    // 分镜名单含 cb1（characterId 口径）
    await ds.getRepository(StoryboardEntity).update(
      { id: sbId },
      { characters: [{ characterId: 'cb1' }] as any },
    )

    const impact = await svc.countAssetReferences('character', 'cb1')
    expect(impact.keyframes).toBe(2)
    expect(impact.storyboards).toBe(1)
    expect(impact.keyframeIds.sort()).toEqual([all[0].id, all[1].id].sort())

    const locImpact = await svc.countAssetReferences('location', 'lb1')
    expect(locImpact.keyframes).toBe(1)
    // storyboards.location_binding_ids 未含 lb1 → 0
    expect(locImpact.storyboards).toBe(0)
  })

  /**
   * S-05 级联重生：对 referenceOverrides 引用该资产的帧逐个重生；
   * 串行执行，单帧失败跳过（id 换新，失败帧保留旧行）。
   */
  it('S-05 regenerateKeyframesReferencingAsset：串行重生，失败单个跳过', async () => {
    const { sbId } = await seedScene(ds)
    const all = await svc.generateKeyframesForStoryboard({ storyboardId: sbId })
    for (const kf of all) {
      await svc.setReferenceOverrides(kf.id, [
        { kind: 'character', bindingId: 'cb1', imageId: 'ai_char' },
      ])
    }

    // 第二次重生调用失败一次（mock 计数：前 3 次是初次生成，第 5 次调用失败）
    let callCount = 0
    imageGen.generate.mockImplementation(async (_opts: any) => {
      callCount += 1
      if (callCount === 2) throw new Error('provider boom')
      return { imagePath: `/tmp/regen_${callCount}.png`, thumbnailPath: null }
    })

    const r = await svc.regenerateKeyframesReferencingAsset('character', 'cb1')
    expect(r.total).toBe(3)
    expect(r.succeeded).toBe(2)
    expect(r.failed).toBe(1)

    // 列表仍是 3 帧；成功的两帧 id 已换新
    const list = await svc.listKeyframes(sbId)
    expect(list).toHaveLength(3)
  })

  /**
   * K1（2026-09-24 一致性修复 Task 6）：frameDescription 里的 @[名字@索引@实体id]
   * 资产引用标记在拼 prompt 前剥成纯名（与视频链路 replaceAssetRefMarkers 口径一致），
   * 图像模型不再收到 @[..] 噪声。
   */
  it('K1：frameDescription 的 @[名字@索引@实体id] 标记剥成纯名进 prompt', async () => {
    const { sbId } = await seedScene(ds)
    await ds.getRepository(StoryboardEntity).update(
      { id: sbId },
      { frameDescription: '@[张三@1@cb1] 推门进入茶馆' } as any,
    )

    await svc.generateKeyframesForStoryboard({ storyboardId: sbId, keyframeCountOverride: 1 })

    const opts = imageGen.generate.mock.calls[0][0] as { prompt: string }
    expect(opts.prompt).toContain('张三 推门进入茶馆')
    expect(opts.prompt).not.toContain('@[')
  })

  /**
   * K2：hasCharacterReference 移到能力截断之后——钉住 maxReferenceImages=0 的 krea2
   * 且同 provider 无可回退的参考图模型时，选中的角色参考图会被能力截断全部丢弃，
   * 风格前缀不让位（避免视觉锚 + 风格锚双失）。
   */
  it('K2：截断后无角色参考图存活 → 风格前缀不让位', async () => {
    const { sbId } = await seedScene(ds)
    await ds.getRepository(VideoProjectEntity).save({
      id: 'proj1',
      name: 'p',
      status: 'draft',
      config: { imageModel: { providerConfigId: 'pc_comfy', modelId: 'krea2' } },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any)
    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      providerConfigs: {
        getEnabled: vi.fn(async () => [{
          id: 'pc_comfy',
          templateId: 'comfyui',
          isEnabled: true,
          models: [{ id: 'krea2', name: 'Krea2 文生图', type: 'image' }],
        }]),
      },
    } as any)

    await svc.generateKeyframesForStoryboard({ storyboardId: sbId, keyframeCountOverride: 1 })

    const opts = imageGen.generate.mock.calls[0][0] as { prompt: string }
    // 选中集含角色参考图（旧逻辑会让位），但截断后存活集为空 → 保持 cinematic 风格前缀
    expect(opts.prompt).not.toContain('与参考图保持一致')
    expect(opts.prompt).toContain('cinematic')
  })

  /**
   * K3：生成闭环内 VLM 审核的参考图基准从「选中」改为「实际生效」——
   * adapter 截断后只剩角色图生效时，审核只收到生效集（与事后审核
   * referenceImageIdsEffective 优先口径一致）。
   */
  it('K3：闭环 VLM 审核基准为截断后生效参考图集', async () => {
    const { sbId } = await seedScene(ds)
    imageGen.generate.mockImplementation(async () => ({
      imagePath: '/tmp/generated_k3.png',
      thumbnailPath: null,
      effectiveReferencePaths: ['/tmp/cb1.png'], // 地点图被能力截断
    }))
    const reviewSpy = vi
      .spyOn(KeyframeReviewService.prototype, 'reviewGeneratedImage')
      .mockResolvedValue({
        status: 'pass',
        issues: [],
        summary: '',
        model: 'qwen-vl-max',
        reviewedAt: new Date().toISOString(),
      } as any)
    vi.spyOn(KeyframeReviewService.prototype, 'resolveReviewModelForStoryboard')
      .mockResolvedValue({ providerConfigId: 'pc_vl', modelId: 'qwen-vl-max' } as any)

    await svc.generateKeyframesForStoryboard({ storyboardId: sbId, keyframeCountOverride: 1 })

    expect(reviewSpy).toHaveBeenCalled()
    // 选中 2 张（角色 + 地点），生效只有角色 1 张 → 审核基准 = ['ai_char']
    expect(reviewSpy.mock.calls[0][0].referenceImageIds).toEqual(['ai_char'])
  })

  /**
   * K5：D4-3 空绑定守卫扩展到三级来源——storyboard_characters 表声明了角色
   * （characterId 指向失效绑定）但解析结果为空时，即使 scene.characters 为空也拦截。
   */
  it('K5：storyboard_characters 表声明角色但解析为空（scene 无角色）→ 拒绝生成', async () => {
    const { sbId, sceneId } = await seedScene(ds)
    await ds.getRepository(SceneScriptEntity).update({ id: sceneId }, { characters: [] as any })
    await ds.getRepository(StoryboardCharacterEntity).save({
      id: 'sbc_ghost',
      storyboardId: sbId,
      characterId: 'cb_ghost',
      positionX: 50,
      positionY: 50,
      positionScale: 1.0,
      expression: '凝重',
      action: '推门',
      facing: 'front',
      sortOrder: 0,
    })

    await expect(
      svc.generateKeyframesForStoryboard({ storyboardId: sbId, keyframeCountOverride: 1 }),
    ).rejects.toThrow(/角色未绑定资产/)
  })

  it('K5：storyboard.characters JSON 声明角色但解析为空（scene 无角色）→ 拒绝生成', async () => {
    const { sbId, sceneId } = await seedScene(ds)
    await ds.getRepository(SceneScriptEntity).update({ id: sceneId }, { characters: [] as any })
    await ds.getRepository(StoryboardEntity).update(
      { id: sbId },
      { characters: [{ characterId: 'cb_ghost', expression: '冷笑' }] as any },
    )

    await expect(
      svc.generateKeyframesForStoryboard({ storyboardId: sbId, keyframeCountOverride: 1 }),
    ).rejects.toThrow(/角色未绑定资产/)
  })

  it('K5：三级来源均无角色（分镜本就无角色）→ 不拦截，正常生成', async () => {
    const { sbId, sceneId } = await seedScene(ds)
    await ds.getRepository(SceneScriptEntity).update({ id: sceneId }, { characters: [] as any })

    const result = await svc.generateKeyframesForStoryboard({
      storyboardId: sbId,
      keyframeCountOverride: 1,
    })
    expect(result).toHaveLength(1)
  })

  /**
   * K6：落库 metadata.actualPrompt = 实际发送的完整 prompt（含项目 stylePrompt 尾缀；
   * 生成器回传 sentPrompt 时以之为准），事后可还原「当时到底发了什么」。
   */
  it('K6：metadata.actualPrompt 与实际发送串一致（含 stylePrompt 尾缀）', async () => {
    const { sbId } = await seedScene(ds)
    await ds.getRepository(VideoProjectEntity).save({
      id: 'proj1',
      name: 'p',
      status: 'draft',
      config: { stylePrompt: '大师级光影' },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any)

    const result = await svc.generateKeyframesForStoryboard({
      storyboardId: sbId,
      keyframeCountOverride: 1,
    })

    const sentPrompt = (imageGen.generate.mock.calls[0][0] as { prompt: string }).prompt
    expect(sentPrompt).toContain('大师级光影')
    const ia = await new ImageAssetRepository(ds).getById(result[0].imageAssetId!)
    expect((ia?.metadata as any)?.actualPrompt).toBe(sentPrompt)
  })

  it('K6：生成器回传 sentPrompt（含 variant 尾）时 actualPrompt 以回传为准', async () => {
    const { sbId } = await seedScene(ds)
    imageGen.generate.mockImplementation(async (opts: any) => ({
      imagePath: '/tmp/generated_k6.png',
      thumbnailPath: null,
      sentPrompt: `${opts.prompt}, variant: ${opts.label}`,
    }))

    const result = await svc.generateKeyframesForStoryboard({
      storyboardId: sbId,
      keyframeCountOverride: 1,
    })

    const ia = await new ImageAssetRepository(ds).getById(result[0].imageAssetId!)
    const actual = (ia?.metadata as any)?.actualPrompt as string
    expect(actual).toContain(', variant: keyframe_start_0')
  })
})
