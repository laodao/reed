/**
 * script-scene-rebuild.service 单测（2026-09-25 一致性修复第二批 · S4）
 *
 * 背景：handleGenerateScript 的 episode_scripts upsert 原先在删建场景事务之外，
 * 场景事务失败留下「新正文+旧场景」脱节；agent 路径更是裸删无级联。修复后
 * 剧本行 upsert + 级联删旧分镜 + 删旧场景建新场景全部并入同一事务。
 *
 * 覆盖：
 * - S4-a 回滚：建新场景中途抛错 → 剧本行不留新正文、旧场景/旧分镜/关键帧/
 *   image_assets 全部保留、剧集状态不动
 * - S4-b 正常路径（已有剧本）：同事务提交，剧本行更新 reviewing、旧场景与
 *   旧分镜级联清空、新场景+桥接表落库、状态回退 scripting
 * - S4-c 新建路径（无既有剧本）：新剧本行 reviewing、episode.scriptId 回写、
 *   pending → scripting 推进保留
 * - S4-d rebuildScenesForScript：不动剧本行，删旧建新 + 状态回退
 * - 全部用例装 SQLite 串行门：事务回调内误用全局 manager/仓库方法立即变红
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
import { SceneBindingWriter } from '@core/platform/episode-production/narrative/scene-binding-writer'
import {
  rebuildScenesForScript,
  upsertScriptAndRebuildScenes,
} from '@core/platform/episode-production/narrative/services/script-scene-rebuild.service'
import type { GeneratedScene } from '@shared/types/episode-production'

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

function genScene(n: number): GeneratedScene {
  return {
    sceneNumber: n,
    location: '茶馆',
    locationBindingId: null,
    locationType: 'interior',
    timeOfDay: 'morning',
    sceneDescription: `第 ${n} 场 清晨茶馆`,
    mood: '安静',
    characters: [{ characterBindingId: null, characterId: '', characterName: '张三' }],
    originalText: '原文片段',
    narration: '旁白',
    dialogues: [
      { id: 'dlg_1', characterBindingId: null, characterId: '', characterName: '张三', text: `第 ${n} 场对白` },
    ],
    actions: [],
  }
}

async function seedEpisode(id: string, status: string): Promise<void> {
  const now = new Date()
  await ds.getRepository(VideoEpisodeEntity).save({
    id,
    projectId: 'p1',
    sourceType: 'uploaded',
    outlineId: null,
    episodeNumber: 1,
    title: '第一集',
    status,
    scriptId: null,
    createdAt: now,
    updatedAt: now,
  } as any)
}

async function seedScript(id: string, episodeId: string): Promise<void> {
  const now = new Date()
  await ds.getRepository(EpisodeScriptEntity).save({
    id,
    projectId: 'p1',
    episodeId,
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
}

async function seedScene(id: string, scriptId: string): Promise<void> {
  const now = new Date()
  await ds.getRepository(SceneScriptEntity).save({
    id,
    episodeScriptId: scriptId,
    sceneNumber: 1,
    location: '旧地点',
    locationBindingId: null,
    locationType: 'exterior',
    timeOfDay: 'morning',
    weather: null,
    sceneDescription: '旧场景（应被替换）',
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
}

async function seedStoryboardWithKeyframe(sbId: string, sceneId: string): Promise<void> {
  const now = new Date()
  await ds.getRepository(StoryboardEntity).save({
    id: sbId,
    sceneScriptId: sceneId,
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
    storyboardId: sbId,
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

const epRow = (id: string) => ds.getRepository(VideoEpisodeEntity).findOne({ where: { id } as any })

describe('upsertScriptAndRebuildScenes（S4：剧本行 upsert 并入场景事务）', () => {
  beforeEach(async () => {
    ds = await buildDb()
    registerPathProvider(() => new StubPathProvider())
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (ds.isInitialized) await ds.destroy()
  })

  it('S4-a：建新场景中途抛错 → 整体回滚，剧本行不留新正文、旧场景/分镜/关键帧保留、状态不动', async () => {
    await seedEpisode('e1', 'storyboarding')
    await seedScript('es_1', 'e1')
    await seedScene('ss_old', 'es_1')
    await seedStoryboardWithKeyframe('sb_old', 'ss_old')

    vi.spyOn(SceneBindingWriter, 'createScenesWithBindingsIn').mockRejectedValueOnce(
      new Error('LLM 脏数据'),
    )

    await expect(
      upsertScriptAndRebuildScenes(
        ds,
        { id: 'e1', projectId: 'p1', outlineId: null },
        { synopsis: '新梗概', scriptContent: '新正文', scenes: [genScene(1)] },
      ),
    ).rejects.toThrow('LLM 脏数据')

    // 剧本行不留新正文（修复前 upsert 在事务外，此处会是「新正文+旧场景」）
    const script = await ds.getRepository(EpisodeScriptEntity).findOne({ where: { id: 'es_1' } as any })
    expect(script).toMatchObject({ synopsis: '旧梗概', scriptContent: '旧正文', status: 'approved' })

    // 旧场景与级联数据完整保留
    expect(await ds.getRepository(SceneScriptEntity).find({ where: { episodeScriptId: 'es_1' } as any }))
      .toHaveLength(1)
    expect(await ds.getRepository(StoryboardEntity).find({ where: { sceneScriptId: 'ss_old' } as any }))
      .toHaveLength(1)
    expect(await ds.getRepository(StoryboardKeyframeEntity).find({ where: { id: 'kf_old' } as any }))
      .toHaveLength(1)
    expect(await ds.getRepository(ImageAssetEntity).find({ where: { id: 'img_old' } as any }))
      .toHaveLength(1)

    // 状态不动
    expect((await epRow('e1'))?.status).toBe('storyboarding')
  })

  it('S4-b：正常路径（已有剧本）同事务提交，剧本行 reviewing、级联清空、状态回退 scripting', async () => {
    await seedEpisode('e1', 'producing')
    await seedScript('es_1', 'e1')
    await seedScene('ss_old', 'es_1')
    await seedStoryboardWithKeyframe('sb_old', 'ss_old')

    const { scriptId, scenes } = await upsertScriptAndRebuildScenes(
      ds,
      { id: 'e1', projectId: 'p1', outlineId: null },
      { synopsis: '新梗概', scriptContent: '新正文', scenes: [genScene(1)] },
    )

    expect(scriptId).toBe('es_1')
    expect(scenes).toHaveLength(1)

    const script = await ds.getRepository(EpisodeScriptEntity).findOne({ where: { id: 'es_1' } as any })
    expect(script).toMatchObject({
      synopsis: '新梗概',
      scriptContent: '新正文',
      scriptFormat: 'standard',
      status: 'reviewing',
    })

    // 旧场景/旧分镜/关键帧/image_assets 级联清空
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
    expect(dialogues[0].text).toBe('第 1 场对白')

    // producing → scripting 回退
    expect((await epRow('e1'))?.status).toBe('scripting')
  })

  it('S4-c：新建路径（无既有剧本）剧本行 reviewing、episode.scriptId 回写、pending 推进 scripting', async () => {
    await seedEpisode('e1', 'pending')

    const { scriptId, scenes } = await upsertScriptAndRebuildScenes(
      ds,
      { id: 'e1', projectId: 'p1', outlineId: null },
      { synopsis: '新梗概', scriptContent: '新正文', scenes: [genScene(1), genScene(2)] },
    )

    expect(scenes).toHaveLength(2)
    const script = await ds.getRepository(EpisodeScriptEntity).findOne({ where: { id: scriptId } as any })
    expect(script).toMatchObject({
      projectId: 'p1',
      episodeId: 'e1',
      status: 'reviewing',
      synopsis: '新梗概',
      scriptContent: '新正文',
      scriptFormat: 'standard',
    })

    const ep = await epRow('e1')
    expect(ep?.scriptId).toBe(scriptId)
    expect(ep?.status).toBe('scripting')
  })
})

describe('rebuildScenesForScript（S4：拆场景删建同事务）', () => {
  beforeEach(async () => {
    ds = await buildDb()
    registerPathProvider(() => new StubPathProvider())
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (ds.isInitialized) await ds.destroy()
  })

  it('S4-d：不动剧本行，旧场景/分镜级联清空、新场景落库、completed 回退 scripting', async () => {
    await seedEpisode('e2', 'completed')
    await seedScript('es_2', 'e2')
    await seedScene('ss_2', 'es_2')
    await seedStoryboardWithKeyframe('sb_2', 'ss_2')

    const scenes = await rebuildScenesForScript(ds, 'e2', 'es_2', [genScene(1), genScene(2)])
    expect(scenes).toHaveLength(2)

    // 剧本行不动
    const script = await ds.getRepository(EpisodeScriptEntity).findOne({ where: { id: 'es_2' } as any })
    expect(script).toMatchObject({ synopsis: '旧梗概', scriptContent: '旧正文', status: 'approved' })

    const sceneRows = await ds.getRepository(SceneScriptEntity).find({
      where: { episodeScriptId: 'es_2' } as any,
      order: { sceneNumber: 'ASC' } as any,
    })
    expect(sceneRows.map(s => s.sceneNumber)).toEqual([1, 2])
    expect(await ds.getRepository(StoryboardEntity).find({ where: { sceneScriptId: 'ss_2' } as any }))
      .toHaveLength(0)
    expect(await ds.getRepository(StoryboardKeyframeEntity).find({ where: { id: 'kf_old' } as any }))
      .toHaveLength(0)

    expect((await epRow('e2'))?.status).toBe('scripting')
  })
})
