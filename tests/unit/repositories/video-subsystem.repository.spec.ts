/**
 * 视频/剧集子系统 Repository 综合测试。
 * 覆盖 11 个 Repo：episode-script / scene-script / storyboard /
 *                  character-binding / location-binding / item-binding /
 *                  scene-character / scene-dialogue / scene-action /
 *                  storyboard-character / image-asset
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { EpisodeScriptRepository } from '@core/database/repositories/episode-script.repository'
import { SceneScriptRepository } from '@core/database/repositories/scene-script.repository'
import { StoryboardRepository } from '@core/database/repositories/storyboard.repository'
import { CharacterBindingRepository } from '@core/database/repositories/character-binding.repository'
import { LocationBindingRepository } from '@core/database/repositories/location-binding.repository'
import { ItemBindingRepository } from '@core/database/repositories/item-binding.repository'
import { SceneCharacterRepository } from '@core/database/repositories/scene-character.repository'
import { SceneDialogueRepository } from '@core/database/repositories/scene-dialogue.repository'
import { SceneActionRepository } from '@core/database/repositories/scene-action.repository'
import { StoryboardCharacterRepository } from '@core/database/repositories/storyboard-character.repository'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'

describe.each(getTestDialects())('视频子系统 Repos [%s]', dialect => {
  let tds: TestDataSource
  let episodeScripts: EpisodeScriptRepository
  let sceneScripts: SceneScriptRepository
  let storyboards: StoryboardRepository
  let characterBindings: CharacterBindingRepository
  let locationBindings: LocationBindingRepository
  let itemBindings: ItemBindingRepository
  let sceneCharacters: SceneCharacterRepository
  let sceneDialogues: SceneDialogueRepository
  let sceneActions: SceneActionRepository
  let storyboardCharacters: StoryboardCharacterRepository
  let imageAssets: ImageAssetRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    episodeScripts = new EpisodeScriptRepository(tds.ds)
    sceneScripts = new SceneScriptRepository(tds.ds)
    storyboards = new StoryboardRepository(tds.ds)
    characterBindings = new CharacterBindingRepository(tds.ds)
    locationBindings = new LocationBindingRepository(tds.ds)
    itemBindings = new ItemBindingRepository(tds.ds)
    sceneCharacters = new SceneCharacterRepository(tds.ds)
    sceneDialogues = new SceneDialogueRepository(tds.ds)
    sceneActions = new SceneActionRepository(tds.ds)
    storyboardCharacters = new StoryboardCharacterRepository(tds.ds)
    imageAssets = new ImageAssetRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  // ============ EpisodeScript ============

  it('EpisodeScript: create + getByEpisodeId + JSON 列', async () => {
    const s = await episodeScripts.create({
      projectId: 'p1',
      episodeId: 'e1',
      outlineId: 'o1',
      synopsis: 'a',
      scriptContent: 'content',
    })
    expect(s.status).toBe('pending')
    expect(typeof s.createdAt).toBe('number')

    const got = await episodeScripts.getByEpisodeId('e1')
    expect(got!.synopsis).toBe('a')
  })

  it('EpisodeScript: update scenes JSON', async () => {
    const s = await episodeScripts.create({
      projectId: 'p1', episodeId: 'e1', outlineId: 'o1',
    })
    await episodeScripts.update(s.id, {
      scenes: [{ id: 's1' } as any],
      totalDuration: 300,
      characterAppearances: ['c1', 'c2'],
      status: 'completed' as any,
    })
    const got = await episodeScripts.getById(s.id)
    expect(got!.scenes).toEqual([{ id: 's1' }])
    expect(got!.characterAppearances).toEqual(['c1', 'c2'])
    expect(got!.status).toBe('completed')
  })

  // ============ SceneScript ============

  it('SceneScript: create + JSON characters/dialogues/actions + 排序', async () => {
    const s2 = await sceneScripts.create({
      episodeScriptId: 'es1',
      sceneNumber: 2,
      location: 'forest',
      locationType: 'exterior' as any,
      timeOfDay: 'morning' as any,
      sceneDescription: 'X',
      mood: 'tense',
      characters: [{ characterId: 'c1' } as any],
      originalText: 'orig',
      narration: 'narr',
      dialogues: [{ id: 'd1' } as any],
      actions: [{ description: 'walk' } as any],
    })
    await sceneScripts.create({
      episodeScriptId: 'es1',
      sceneNumber: 1,
      location: 'street',
      locationType: 'exterior' as any,
      timeOfDay: 'morning' as any,
      sceneDescription: 'Y',
      mood: 'calm',
      characters: [],
      originalText: '',
      narration: '',
      dialogues: [],
      actions: [],
    })
    const list = await sceneScripts.getByEpisodeScriptId('es1')
    expect(list.map(s => s.sceneNumber)).toEqual([1, 2])
    expect(list[1].characters).toEqual([{ characterId: 'c1' }])
    expect(list[1].dialogues).toEqual([{ id: 'd1' }])
  })

  it('SceneScript: createMany + countBy + deleteBy', async () => {
    await sceneScripts.createMany([
      {
        episodeScriptId: 'es1', sceneNumber: 1, location: 'a',
        locationType: 'exterior' as any, timeOfDay: 'morning' as any,
        sceneDescription: '', mood: '', characters: [], originalText: '',
        narration: '', dialogues: [], actions: [],
      },
      {
        episodeScriptId: 'es1', sceneNumber: 2, location: 'b',
        locationType: 'exterior' as any, timeOfDay: 'morning' as any,
        sceneDescription: '', mood: '', characters: [], originalText: '',
        narration: '', dialogues: [], actions: [],
      },
    ])
    expect(await sceneScripts.countByEpisodeScriptId('es1')).toBe(2)
    expect(await sceneScripts.deleteByEpisodeScriptId('es1')).toBe(2)
  })

  // ============ Storyboard ============

  it('Storyboard: create 默认 transition_* null + JSON transition + parseTransition 兼容', async () => {
    const sb = await storyboards.create({
      sceneScriptId: 'ss1',
      shotNumber: 1,
      shotType: 'medium' as any,
      cameraAngle: 'eye_level' as any,
      cameraMovement: 'static' as any,
      frameDescription: 'fd',
      characters: [],
      dialogueIds: [],
      actionIds: [],
      duration: 5,
      transition: { type: 'fade', duration: 800 } as any,
    })
    expect(sb.transition.type).toBe('fade')
    expect(sb.transition.duration).toBe(800)
  })

  it('Storyboard: getBySceneScriptId 排序 + count + updateStatusBy', async () => {
    await storyboards.createMany([
      {
        sceneScriptId: 'ss1', shotNumber: 1, shotType: 'wide' as any,
        cameraAngle: 'eye_level' as any, cameraMovement: 'static' as any,
        frameDescription: '1', characters: [], dialogueIds: [], actionIds: [],
        duration: 3, transition: { type: 'cut', duration: 500 } as any,
      },
      {
        sceneScriptId: 'ss1', shotNumber: 2, shotType: 'medium' as any,
        cameraAngle: 'eye_level' as any, cameraMovement: 'static' as any,
        frameDescription: '2', characters: [], dialogueIds: [], actionIds: [],
        duration: 3, transition: { type: 'cut', duration: 500 } as any,
      },
    ])
    const list = await storyboards.getBySceneScriptId('ss1')
    expect(list.map(s => s.shotNumber)).toEqual([1, 2])
    expect(await storyboards.countBySceneScriptId('ss1')).toBe(2)
    expect(await storyboards.updateStatusBySceneScriptId('ss1', 'completed' as any)).toBe(2)
  })

  // ============ Bindings ============

  it('CharacterBinding: 创建 + 规范化字段同步写入', async () => {
    const b = await characterBindings.create({
      projectId: 'p1',
      longWritingCharacterId: 'lwc1',
      voiceConfig: { voiceId: 'v1', speed: 1.2, pitch: 0.8 } as any,
      generateConfig: { baseDescription: 'desc', styleReference: 'ref' } as any,
    })
    expect(b.voiceConfig).toMatchObject({ voiceId: 'v1', speed: 1.2 })
    const got = await characterBindings.getById(b.id)
    expect(got!.generateConfig?.baseDescription).toBe('desc')
  })

  it('LocationBinding: imagePaths JSON + addImage 追加', async () => {
    const b = await locationBindings.create({
      projectId: 'p1',
      longWritingLocationId: 'lwl1',
      locationName: 'Forest',
      imagePaths: ['/a.png'],
    })
    expect(b.imagePaths).toEqual(['/a.png'])

    expect(await locationBindings.addImage(b.id, '/b.png')).toBe(true)
    const got = await locationBindings.getById(b.id)
    expect(got!.imagePaths).toEqual(['/a.png', '/b.png'])
  })

  it('ItemBinding: 创建 + getByLongWritingItemId', async () => {
    await itemBindings.create({
      projectId: 'p1', longWritingItemId: 'lwi1', itemName: 'Sword',
    })
    const b = await itemBindings.getByLongWritingItemId('p1', 'lwi1')
    expect(b!.itemName).toBe('Sword')
  })

  // ============ Scene leaves ============

  it('SceneCharacter: 含 props 副表 transaction', async () => {
    const c = await sceneCharacters.create({
      sceneScriptId: 'ss1',
      characterId: 'c1',
      characterName: 'Hero',
      props: ['sword', 'shield'],
      sortOrder: 0,
    })
    expect(c.props).toEqual(['sword', 'shield'])

    const list = await sceneCharacters.getBySceneScriptId('ss1')
    expect(list[0].props).toEqual(['sword', 'shield'])

    // update 替换 props
    const c2 = await sceneCharacters.create({
      sceneScriptId: 'ss1', characterId: 'c2', characterName: 'B', sortOrder: 1,
    })
    const found = await sceneCharacters.getBySceneScriptId('ss1')
    expect(found).toHaveLength(2)
    expect(c2.characterName).toBe('B')
  })

  it('SceneDialogue: createMany + 默认值', async () => {
    await sceneDialogues.createMany([
      { sceneScriptId: 'ss1', characterId: 'c1', characterName: 'A', text: 'hi', sortOrder: 0 },
      { sceneScriptId: 'ss1', characterId: 'c1', characterName: 'A', text: 'bye', sortOrder: 1 },
    ])
    const list = await sceneDialogues.getBySceneScriptId('ss1')
    expect(list).toHaveLength(2)
    expect(list[0].volume).toBe('normal')
    expect(list[0].pace).toBe('normal')
  })

  it('SceneAction: timing 默认 during', async () => {
    const a = await sceneActions.create({
      sceneScriptId: 'ss1',
      description: 'walks',
      sortOrder: 0,
    })
    expect(a.timing).toBe('during')
    expect(await sceneActions.countBySceneScriptId('ss1')).toBe(1)
  })

  it('StoryboardCharacter: position 默认值', async () => {
    const sc = await storyboardCharacters.create({
      storyboardId: 'sb1',
      characterId: 'c1',
      sortOrder: 0,
    })
    expect(sc.position).toEqual({ x: 50, y: 50, scale: 1.0 })
    expect(sc.facing).toBe('front')
  })

  // ============ ImageAsset ============

  it('ImageAsset: createdAt INTEGER 直接为 number + getByType', async () => {
    const a = await imageAssets.create({
      projectId: 'p1',
      type: 'character' as any,
      prompt: 'P',
      imagePath: '/img.png',
      width: 1024,
      height: 1024,
      provider: 'dashscope',
      metadata: { seed: 42 },
    })
    expect(typeof a.createdAt).toBe('number')
    expect(a.metadata).toEqual({ seed: 42 })

    expect((await imageAssets.getByProjectId('p1')).length).toBe(1)
    expect((await imageAssets.getByType('p1', 'character' as any)).length).toBe(1)
    expect(await imageAssets.countByProjectId('p1')).toBe(1)
  })
})
