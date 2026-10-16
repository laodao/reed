/**
 * EP Agent generate_script / split_scenes 动作单测（2026-09-25 一致性修复第二批 · S5）
 *
 * 背景：agent 两动作原先 deleteByEpisodeScriptId 裸删（无级联、无事务），
 * 状态只在 pending/asset_prep 才动——丢失 handler 的三条防线。修复后与
 * handler 共用 script-scene-rebuild service：级联删旧分镜（cleanupStoryboards）
 * + 事务化删旧建新 + 剧本行 upsert + 状态收敛 scripting。
 *
 * 覆盖：
 * - S5-a generate_script（已有剧本）：旧分镜/关键帧/image_assets 级联清理、
 *   剧本行更新 reviewing、新场景落库、storyboarding → scripting 状态回退
 * - S5-b split_scenes：旧场景/分镜级联清空、新场景落库、producing → scripting
 *   状态回退（修复前 split_scenes 完全不动状态）
 *
 * 真实 better-sqlite3 :memory:（装串行门）；AI 生成与 roster 构建 mock 掉，
 * computeEpProductionState mock 掉（动作后重算不依赖真实库）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { SceneCharacterEntity } from '@core/database/entities/episode-production/scene-character.entity'
import { ScenePropEntity } from '@core/database/entities/episode-production/scene-prop.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { SceneActionEntity } from '@core/database/entities/episode-production/scene-action.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardCharacterEntity } from '@core/database/entities/episode-production/storyboard-character.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { installSqliteSerialGate } from '@core/database/sqlite-serial-gate'
import { registerPathProvider, type IPathProvider } from '@core/interfaces/path.interface'
import type { GeneratedScene } from '@shared/types/episode-production'

// AI 生成可控化
const generatorMock = vi.hoisted(() => ({
  generateFullScript: vi.fn(),
  generateScenesFromSynopsis: vi.fn(),
}))
vi.mock('@core/platform/episode-production/narrative/ai/script-generator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/platform/episode-production/narrative/ai/script-generator')>()
  return {
    ...actual,
    EpisodeScriptGenerator: class {
      static getInstance() {
        return generatorMock
      }
    },
  }
})

// roster 构建不依赖真实 binding 表
vi.mock('@core/platform/episode-production/narrative/asset-roster-builder', () => ({
  buildAssetRosterForProject: vi.fn(async () => ({ characters: [], locations: [], items: [] })),
}))

// 动作后生产状态重算可控化（checkEpActionDependency 保持真实实现）
const computeStateMock = vi.hoisted(() => vi.fn())
vi.mock('@core/platform/episode-production/agent/ep-agent-deps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/platform/episode-production/agent/ep-agent-deps')>()
  return { ...actual, computeEpProductionState: (...args: unknown[]) => computeStateMock(...args) }
})

import { executeEpActions } from '@core/platform/episode-production/agent/ep-agent-actions'

class StubPathProvider implements IPathProvider {
  getUserDataPath(): string { return '/tmp' }
  getAppDataPath(): string { return '/tmp' }
  getTempPath(): string { return '/tmp' }
  getDataPath(): string { return '/tmp' }
  getSubDirectories(): never { throw new Error('not used') }
  getSubDirectoryPath(): never { throw new Error('not used') }
  toAssetUrl(rel: string): string { return `/assets/${rel}` }
}

let ds: DataSource

function genScene(n: number): GeneratedScene {
  return {
    sceneNumber: n,
    location: '茶馆',
    locationBindingId: null,
    locationType: 'interior',
    timeOfDay: 'morning',
    sceneDescription: `第 ${n} 场`,
    mood: '安静',
    characters: [],
    originalText: '原文',
    narration: '旁白',
    dialogues: [
      { id: 'dlg_1', characterBindingId: null, characterId: '', characterName: '张三', text: `第 ${n} 场对白` },
    ],
    actions: [],
  }
}

const baseState = {
  episode: { id: 'e1', hasScript: true },
  scenes: { total: 1, countWithBindings: 0, locations: [] },
  storyboards: { total: 1, scenesCovered: 1, scenesTotal: 1 },
  assets: { characters: { count: 0, names: [] }, locations: { count: 0, names: [] }, items: { count: 0, names: [] } },
}

async function buildDb(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      VideoEpisodeEntity,
      EpisodeScriptEntity,
      SceneScriptEntity,
      SceneCharacterEntity,
      ScenePropEntity,
      SceneDialogueEntity,
      SceneActionEntity,
      LocationBindingEntity,
      CharacterBindingEntity,
      StoryboardEntity,
      StoryboardCharacterEntity,
      StoryboardKeyframeEntity,
      EpVideoSegmentEntity,
      ImageAssetEntity,
    ],
    synchronize: true,
  })
  await dataSource.initialize()
  installSqliteSerialGate(dataSource)
  return dataSource
}

/** 真实 ds 上的薄 facade（agent 只用到这几个仓库方法 + dataSource） */
function dbFacade(): any {
  return {
    dataSource: ds,
    videoProjects: {
      getById: async (id: string) => ({ id, name: '测试项目', longWritingProjectId: null }),
    },
    videoEpisodes: {
      getById: async (id: string) =>
        ds.getRepository(VideoEpisodeEntity).findOne({ where: { id } as any }),
    },
    episodeScripts: {
      getById: async (id: string) =>
        ds.getRepository(EpisodeScriptEntity).findOne({ where: { id } as any }),
      getByEpisodeId: async (episodeId: string) =>
        ds.getRepository(EpisodeScriptEntity).findOne({ where: { episodeId } as any }),
    },
  }
}

async function seedEpisodeWithOldChain(status: string): Promise<void> {
  const now = new Date()
  await ds.getRepository(VideoEpisodeEntity).save({
    id: 'e1',
    projectId: 'p1',
    sourceType: 'uploaded',
    outlineId: null,
    episodeNumber: 1,
    title: '第一集',
    status,
    scriptId: 'es_1',
    createdAt: now,
    updatedAt: now,
  } as any)
  await ds.getRepository(EpisodeScriptEntity).save({
    id: 'es_1',
    projectId: 'p1',
    episodeId: 'e1',
    outlineId: null,
    status: 'approved',
    synopsis: '旧梗概',
    scriptContent: '旧正文',
    scriptFormat: 'standard',
    scenes: [],
    totalDuration: 0,
    characterAppearances: [],
    createdAt: now,
    updatedAt: now,
  } as any)
  await ds.getRepository(SceneScriptEntity).save({
    id: 'ss_old',
    episodeScriptId: 'es_1',
    sceneNumber: 1,
    location: '旧地点',
    locationBindingId: null,
    locationType: 'exterior',
    timeOfDay: 'morning',
    weather: null,
    sceneDescription: '旧场景',
    mood: null,
    lighting: null,
    characters: [],
    originalText: null,
    narration: null,
    dialogues: [],
    actions: [],
    createdAt: now,
    updatedAt: now,
  } as any)
  await ds.getRepository(StoryboardEntity).save({
    id: 'sb_old',
    sceneScriptId: 'ss_old',
    shotNumber: 1,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    movementDuration: null,
    frameDescription: '旧分镜',
    subject: null,
    composition: null,
    characters: null,
    narrationId: null,
    dialogueIds: [],
    actionIds: [],
    frameImage: null,
    frameImageId: null,
    videoPath: null,
    segmentId: null,
    segmentSeq: null,
    duration: 4,
    transition: '{}',
    transitionType: null,
    transitionDurationMs: null,
    transitionDirection: null,
    transitionEasing: null,
    transitionColor: null,
    status: 'completed',
    keyframeCount: 1,
    videoProviderId: null,
    videoModelId: null,
    videoMode: null,
    use3dStaging: 0,
    stagingLayoutId: null,
    backgroundRefImageId: null,
    createdAt: now,
    updatedAt: now,
  } as any)
  await ds.getRepository(ImageAssetEntity).save({
    id: 'img_old',
    projectId: 'p1',
    type: 'keyframe',
    provider: null,
    model: null,
    prompt: '',
    negativePrompt: null,
    imagePath: 'nonexistent.png',
    thumbnailPath: null,
    width: 512,
    height: 512,
    metadata: null,
    createdAt: now,
  } as any)
  await ds.getRepository(StoryboardKeyframeEntity).save({
    id: 'kf_old',
    storyboardId: 'sb_old',
    frameIndex: 0,
    timePercent: 0,
    frameRole: 'start',
    imageAssetId: 'img_old',
    derivedFromKeyframeId: null,
    prompt: null,
    negativePrompt: null,
    userPromptOverride: null,
    referenceOverrides: null,
    createdAt: now,
    updatedAt: null,
  } as any)
}

function mkCtx(): any {
  return { projectId: 'p1', episodeId: 'e1', db: dbFacade(), ai: null, emit: vi.fn() }
}

describe('EP Agent generate_script / split_scenes（S5：与 handler 同防线）', () => {
  beforeEach(async () => {
    ds = await buildDb()
    registerPathProvider(() => new StubPathProvider())
    computeStateMock.mockReset()
    computeStateMock.mockResolvedValue(baseState)
    generatorMock.generateFullScript.mockReset()
    generatorMock.generateScenesFromSynopsis.mockReset()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('S5-a generate_script：删旧有级联（旧分镜/关键帧/image_assets 清理），剧本行 reviewing，状态回退 scripting', async () => {
    await seedEpisodeWithOldChain('storyboarding')
    generatorMock.generateFullScript.mockResolvedValue({
      synopsis: '新梗概',
      scriptContent: '新正文',
      scenes: [genScene(1)],
    })

    const summaries = await executeEpActions(
      mkCtx(),
      [{ type: 'generate_script', params: { chapterContent: '章节正文' } }],
      baseState as any,
    )

    expect(summaries).toHaveLength(1)
    expect(summaries[0].status).toBe('ok')
    expect((summaries[0].data as any).scriptId).toBe('es_1')

    // 剧本行更新（与 handler 同口径）
    const script = await ds.getRepository(EpisodeScriptEntity).findOne({ where: { id: 'es_1' } as any })
    expect(script).toMatchObject({ synopsis: '新梗概', scriptContent: '新正文', status: 'reviewing' })

    // 旧场景 + 旧分镜/关键帧/image_assets 级联清空（修复前裸删场景，分镜成孤儿）
    const sceneRows = await ds.getRepository(SceneScriptEntity).find({ where: { episodeScriptId: 'es_1' } as any })
    expect(sceneRows).toHaveLength(1)
    expect(sceneRows[0].id).not.toBe('ss_old')
    expect(await ds.getRepository(StoryboardEntity).find({ where: { sceneScriptId: 'ss_old' } as any }))
      .toHaveLength(0)
    expect(await ds.getRepository(StoryboardKeyframeEntity).find({ where: { id: 'kf_old' } as any }))
      .toHaveLength(0)
    expect(await ds.getRepository(ImageAssetEntity).find({ where: { id: 'img_old' } as any }))
      .toHaveLength(0)

    // 新场景桥接表落库
    const dialogues = await ds.getRepository(SceneDialogueEntity).find({
      where: { sceneScriptId: sceneRows[0].id } as any,
    })
    expect(dialogues).toHaveLength(1)

    // 状态回退（修复前 storyboarding 不回退）
    const ep = await ds.getRepository(VideoEpisodeEntity).findOne({ where: { id: 'e1' } as any })
    expect(ep?.status).toBe('scripting')
  })

  it('S5-b split_scenes：删旧建新同事务 + 级联清分镜 + producing 回退 scripting', async () => {
    await seedEpisodeWithOldChain('producing')
    generatorMock.generateScenesFromSynopsis.mockResolvedValue([genScene(1), genScene(2)])

    const summaries = await executeEpActions(mkCtx(), [{ type: 'split_scenes' }], baseState as any)

    expect(summaries).toHaveLength(1)
    expect(summaries[0].status).toBe('ok')
    expect((summaries[0].data as any).scenesCount).toBe(2)

    const sceneRows = await ds.getRepository(SceneScriptEntity).find({
      where: { episodeScriptId: 'es_1' } as any,
      order: { sceneNumber: 'ASC' } as any,
    })
    expect(sceneRows.map(s => s.sceneNumber)).toEqual([1, 2])
    expect(await ds.getRepository(StoryboardEntity).find({ where: { sceneScriptId: 'ss_old' } as any }))
      .toHaveLength(0)
    expect(await ds.getRepository(StoryboardKeyframeEntity).find({ where: { id: 'kf_old' } as any }))
      .toHaveLength(0)

    // 剧本行不被 split_scenes 触碰
    const script = await ds.getRepository(EpisodeScriptEntity).findOne({ where: { id: 'es_1' } as any })
    expect(script).toMatchObject({ synopsis: '旧梗概', status: 'approved' })

    const ep = await ds.getRepository(VideoEpisodeEntity).findOne({ where: { id: 'e1' } as any })
    expect(ep?.status).toBe('scripting')
  })
})
