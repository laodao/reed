/**
 * SceneScriptService.validateCompleteness 单测（P4-T5）
 * @module tests/unit/episode-production/narrative/scene-script.service
 *
 * 覆盖：
 * - JSON 列回退路径：scene_characters / dialogues / actions 表为空 → 从 JSON 合成
 * - 归一化表优先路径：表里有数据时不读 JSON
 * - validateEpisodeCompleteness 多场景汇总
 * - 场景不存在抛错
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { LwLocationEntity } from '@core/database/entities/lw-location.entity'
import { LwItemEntity } from '@core/database/entities/lw-item.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { SceneCharacterEntity } from '@core/database/entities/episode-production/scene-character.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { SceneActionEntity } from '@core/database/entities/episode-production/scene-action.entity'
import { ScenePropEntity } from '@core/database/entities/episode-production/scene-prop.entity'
import { SceneScriptService } from '@core/modules/episode-production/narrative/services/scene-script.service'

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
      SceneCharacterEntity,
      SceneDialogueEntity,
      SceneActionEntity,
      ScenePropEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedCommonAssets(ds: DataSource): Promise<void> {
  await ds.getRepository(CharacterBindingEntity).save({
    id: 'cb1',
    projectId: 'p1',
    longWritingCharacterId: null,
    sourceType: 'standalone',
    voiceConfig: {},
    voiceId: 'v1',
    standaloneName: '张三',
    standaloneDescription: '主角',
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
  await ds.getRepository(ItemBindingEntity).save({
    id: 'ib1',
    projectId: 'p1',
    longWritingItemId: null,
    sourceType: 'standalone',
    itemName: '茶壶',
    standaloneName: '茶壶',
    standaloneDescription: '紫砂壶',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  for (const [t, id] of [
    ['character', 'cb1'],
    ['location', 'lb1'],
    ['item', 'ib1'],
  ] as const) {
    await ds.getRepository(AssetImageEntity).save({
      id: `ai_${id}`,
      assetType: t,
      assetId: id,
      category: 'main',
      imagePath: `/tmp/${id}.png`,
      isMain: 1,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
  }
}

describe('SceneScriptService.validateCompleteness', () => {
  let ds: DataSource
  let svc: SceneScriptService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new SceneScriptService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('JSON 列路径：归一化表为空时从 JSON 合成 + 校验通过', async () => {
    await seedCommonAssets(ds)
    await ds.getRepository(SceneScriptEntity).save({
      id: 's1',
      episodeScriptId: 'es1',
      sceneNumber: 1,
      location: '茶馆',
      locationBindingId: 'lb1',
      locationType: 'interior',
      timeOfDay: 'morning',
      weather: null,
      sceneDescription: '茶馆',
      mood: '安静',
      lighting: null,
      characters: [
        {
          characterBindingId: 'cb1',
          characterId: 'lwc-x',
          characterName: '张三',
          position: 'center',
          props: [{ itemBindingId: 'ib1', name: '茶壶' }],
        },
      ],
      originalText: '',
      narration: '',
      dialogues: [
        {
          id: 'd1',
          characterBindingId: 'cb1',
          characterId: 'lwc-x',
          characterName: '张三',
          text: '一壶茶',
        },
      ],
      actions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const report = await svc.validateCompleteness('s1')
    expect(report.ok).toBe(true)
    expect(report.errorCount).toBe(0)
  })

  it('JSON 列路径：缺 locationBindingId → LOCATION_BINDING_MISSING', async () => {
    await seedCommonAssets(ds)
    await ds.getRepository(SceneScriptEntity).save({
      id: 's1',
      episodeScriptId: 'es1',
      sceneNumber: 1,
      location: '某处',
      locationBindingId: null,
      locationType: 'interior',
      timeOfDay: 'morning',
      weather: null,
      sceneDescription: '',
      mood: '',
      lighting: null,
      characters: [],
      originalText: '',
      narration: '',
      dialogues: [],
      actions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const report = await svc.validateCompleteness('s1')
    expect(report.ok).toBe(false)
    expect(report.violations.map((v) => v.code)).toContain(
      'LOCATION_BINDING_MISSING',
    )
  })

  it('归一化表优先：scene_characters 有数据时不读 JSON', async () => {
    await seedCommonAssets(ds)
    await ds.getRepository(SceneScriptEntity).save({
      id: 's1',
      episodeScriptId: 'es1',
      sceneNumber: 1,
      location: '茶馆',
      locationBindingId: 'lb1',
      locationType: 'interior',
      timeOfDay: 'morning',
      weather: null,
      sceneDescription: '',
      mood: '',
      lighting: null,
      // JSON 含错误的 binding（fakebind 不存在），但应该被归一化表覆盖
      characters: [
        {
          characterBindingId: 'cb_fake',
          characterId: 'x',
          characterName: '影子',
        },
      ],
      originalText: '',
      narration: '',
      dialogues: [],
      actions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    // 归一化表里写正确的 binding
    await ds.getRepository(SceneCharacterEntity).save({
      id: 'sc1',
      sceneScriptId: 's1',
      characterId: 'lwc-1',
      characterBindingId: 'cb1',
      characterName: '张三',
      position: 'center',
      sortOrder: 0,
    } as any)

    const report = await svc.validateCompleteness('s1')
    // 归一化表优先：cb1 解析成功，没有 CHARACTER_BINDING_UNRESOLVED 违例
    expect(report.violations.some((v) => v.code === 'CHARACTER_BINDING_UNRESOLVED')).toBe(
      false,
    )
    expect(report.ok).toBe(true)
  })

  it('validateEpisodeCompleteness：多场景汇总', async () => {
    await seedCommonAssets(ds)
    await ds.getRepository(SceneScriptEntity).save([
      {
        id: 's1',
        episodeScriptId: 'es1',
        sceneNumber: 1,
        location: '茶馆',
        locationBindingId: 'lb1',
        locationType: 'interior',
        timeOfDay: 'morning',
        sceneDescription: '',
        characters: [],
        dialogues: [],
        actions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 's2',
        episodeScriptId: 'es1',
        sceneNumber: 2,
        location: '走廊',
        locationBindingId: null, // 缺
        locationType: 'interior',
        timeOfDay: 'morning',
        sceneDescription: '',
        characters: [],
        dialogues: [],
        actions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any)

    const report = await svc.validateEpisodeCompleteness('es1')
    expect(report.errorCount).toBe(1)
    expect(report.violations[0].sceneNumber).toBe(2)
  })

  it('场景不存在抛错', async () => {
    await expect(svc.validateCompleteness('s_ghost')).rejects.toThrow(
      /SceneScript not found/,
    )
  })
})
