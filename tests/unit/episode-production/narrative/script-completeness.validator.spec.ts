/**
 * ScriptCompletenessValidator 单测（P4-T3）
 * @module tests/unit/episode-production/narrative/script-completeness.validator
 *
 * 覆盖 spec §4.1 强约束的全部违例分支：
 * - 通过场景：所有 binding 解析成功且主图就绪 → ok=true
 * - 各类违例：location / character / dialogue / action / prop 五种主体的缺失/未解析/无主图
 * - voice 缺失为 warning，不阻断 ok
 * - 群像动作 (characterBindingId null) 不算违例
 * - 多场景汇总报告
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
import { ReferenceResolver } from '@core/platform/episode-production/narrative/reference-resolver'
import { ScriptCompletenessValidator } from '@core/platform/episode-production/narrative/validators/script-completeness.validator'

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

async function seedFullAsset(ds: DataSource): Promise<{
  charBindingId: string
  locBindingId: string
  itemBindingId: string
}> {
  // standalone character + 主图 + voice
  await ds.getRepository(CharacterBindingEntity).save({
    id: 'cb1',
    projectId: 'p1',
    longWritingCharacterId: null,
    sourceType: 'standalone',
    voiceConfig: {},
    voiceId: 'voice_default',
    standaloneName: '张三',
    standaloneDescription: '茶馆客人',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  // standalone location + 主图
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
  // standalone item + 主图
  await ds.getRepository(ItemBindingEntity).save({
    id: 'ib1',
    projectId: 'p1',
    longWritingItemId: null,
    sourceType: 'standalone',
    itemName: '茶壶',
    standaloneName: '茶壶',
    standaloneDescription: '紫砂茶壶',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  // 三张主图
  for (const [t, id] of [
    ['character', 'cb1'],
    ['location', 'lb1'],
    ['item', 'ib1'],
  ] as const) {
    await ds.getRepository(AssetImageEntity).save({
      id: `ai_${id}`,
      userId: null,
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
  return { charBindingId: 'cb1', locBindingId: 'lb1', itemBindingId: 'ib1' }
}

function makeScene(opts: {
  id?: string
  num?: number
  locationBindingId?: string | null
}): SceneScriptEntity {
  return {
    userId: null,
    id: opts.id ?? 's1',
    episodeScriptId: 'es1',
    sceneNumber: opts.num ?? 1,
    location: '茶馆',
    locationBindingId: opts.locationBindingId === undefined ? 'lb1' : opts.locationBindingId,
    locationType: 'interior',
    timeOfDay: 'morning',
    weather: null,
    sceneDescription: '清晨茶馆',
    mood: null,
    lighting: null,
    characters: null,
    originalText: null,
    narration: null,
    dialogues: null,
    actions: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as SceneScriptEntity
}

function makeChar(opts: {
  id: string
  bindingId: string | null
  name?: string
}): SceneCharacterEntity {
  return {
    userId: null,
    id: opts.id,
    sceneScriptId: 's1',
    characterId: 'lwc-x',
    characterBindingId: opts.bindingId,
    characterName: opts.name ?? '张三',
    position: 'center',
    expression: null,
    action: null,
    outfit: null,
    sortOrder: 0,
  } as SceneCharacterEntity
}

function makeDialogue(opts: {
  id: string
  bindingId: string | null
  voiceId?: string | null
  text?: string
}): SceneDialogueEntity {
  return {
    userId: null,
    id: opts.id,
    sceneScriptId: 's1',
    characterId: 'lwc-x',
    characterBindingId: opts.bindingId,
    characterName: '张三',
    text: opts.text ?? '请来一壶茶',
    emotion: null,
    volume: 'normal',
    pace: 'normal',
    pause: 0,
    voiceId: opts.voiceId ?? null,
    audioAssetId: null,
    sortOrder: 0,
  } as SceneDialogueEntity
}

function makeAction(opts: {
  id: string
  bindingId: string | null
}): SceneActionEntity {
  return {
    userId: null,
    id: opts.id,
    sceneScriptId: 's1',
    characterId: null,
    characterBindingId: opts.bindingId,
    description: '推门进入',
    timing: 'before',
    duration: null,
    sortOrder: 0,
  } as SceneActionEntity
}

function makeProp(opts: {
  id: string
  itemBindingId: string | null
  name?: string
}): ScenePropEntity {
  return {
    userId: null,
    id: opts.id,
    sceneCharacterId: 'sc1',
    propName: opts.name ?? '茶壶',
    itemBindingId: opts.itemBindingId,
  } as ScenePropEntity
}

describe('ScriptCompletenessValidator', () => {
  let ds: DataSource
  let validator: ScriptCompletenessValidator

  beforeEach(async () => {
    ds = await buildDb()
    validator = new ScriptCompletenessValidator(new ReferenceResolver(ds))
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('全绿：所有 binding 解析 + 主图就绪 → ok=true', async () => {
    await seedFullAsset(ds)
    const report = await validator.validateScene({
      scene: makeScene({}),
      characters: [makeChar({ id: 'sc1', bindingId: 'cb1' })],
      dialogues: [makeDialogue({ id: 'd1', bindingId: 'cb1' })],
      actions: [makeAction({ id: 'a1', bindingId: null })], // 群像动作
      props: [makeProp({ id: 'p1', itemBindingId: 'ib1' })],
    })
    expect(report.ok).toBe(true)
    expect(report.errorCount).toBe(0)
    expect(report.violations).toHaveLength(0)
  })

  it('LOCATION_BINDING_MISSING：场景未绑定地点', async () => {
    await seedFullAsset(ds)
    const report = await validator.validateScene({
      scene: makeScene({ locationBindingId: null }),
      characters: [makeChar({ id: 'sc1', bindingId: 'cb1' })],
      dialogues: [],
      actions: [],
      props: [],
    })
    expect(report.ok).toBe(false)
    const codes = report.violations.map((v) => v.code)
    expect(codes).toContain('LOCATION_BINDING_MISSING')
  })

  it('LOCATION_BINDING_UNRESOLVED：地点 binding 不存在', async () => {
    await seedFullAsset(ds)
    const report = await validator.validateScene({
      scene: makeScene({ locationBindingId: 'lb_ghost' }),
      characters: [],
      dialogues: [],
      actions: [],
      props: [],
    })
    expect(report.ok).toBe(false)
    expect(report.violations.map((v) => v.code)).toContain(
      'LOCATION_BINDING_UNRESOLVED',
    )
  })

  it('LOCATION_MAIN_IMAGE_MISSING：地点存在但无主图', async () => {
    // 仅建 location binding，不建主图
    await ds.getRepository(LocationBindingEntity).save({
      id: 'lb_no_main',
      projectId: 'p1',
      longWritingLocationId: null,
      sourceType: 'standalone',
      locationName: '客栈',
      standaloneName: '客栈',
      standaloneDescription: '小客栈',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    const report = await validator.validateScene({
      scene: makeScene({ locationBindingId: 'lb_no_main' }),
      characters: [],
      dialogues: [],
      actions: [],
      props: [],
    })
    expect(report.violations.map((v) => v.code)).toContain(
      'LOCATION_MAIN_IMAGE_MISSING',
    )
  })

  it('CHARACTER_BINDING_MISSING：出场角色未绑 binding', async () => {
    await seedFullAsset(ds)
    const report = await validator.validateScene({
      scene: makeScene({}),
      characters: [makeChar({ id: 'sc1', bindingId: null, name: '匿名' })],
      dialogues: [],
      actions: [],
      props: [],
    })
    expect(report.violations.map((v) => v.code)).toContain(
      'CHARACTER_BINDING_MISSING',
    )
    const v = report.violations.find((v) => v.code === 'CHARACTER_BINDING_MISSING')!
    expect(v.context.targetType).toBe('character')
    expect(v.context.targetId).toBe('sc1')
  })

  it('CHARACTER_MAIN_IMAGE_MISSING：角色存在但无主图', async () => {
    await ds.getRepository(LocationBindingEntity).save({
      id: 'lb1',
      projectId: 'p1',
      longWritingLocationId: null,
      sourceType: 'standalone',
      locationName: '茶馆',
      standaloneName: '茶馆',
      standaloneDescription: '茶馆',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(AssetImageEntity).save({
      id: 'ai_lb1',
      assetType: 'location',
      assetId: 'lb1',
      category: 'main',
      imagePath: '/tmp/lb1.png',
      isMain: 1,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb_no_main',
      projectId: 'p1',
      longWritingCharacterId: null,
      sourceType: 'standalone',
      voiceConfig: {},
      voiceId: 'v1',
      standaloneName: '李四',
      standaloneDescription: '路人',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    const report = await validator.validateScene({
      scene: makeScene({}),
      characters: [makeChar({ id: 'sc1', bindingId: 'cb_no_main' })],
      dialogues: [],
      actions: [],
      props: [],
    })
    expect(report.violations.map((v) => v.code)).toContain(
      'CHARACTER_MAIN_IMAGE_MISSING',
    )
  })

  it('DIALOGUE_VOICE_MISSING 是 warning 不阻断 ok', async () => {
    await seedFullAsset(ds)
    // 把 cb1 的 voice 清空
    await ds
      .getRepository(CharacterBindingEntity)
      .update('cb1', { voiceId: null })
    const report = await validator.validateScene({
      scene: makeScene({}),
      characters: [makeChar({ id: 'sc1', bindingId: 'cb1' })],
      dialogues: [makeDialogue({ id: 'd1', bindingId: 'cb1', voiceId: null })],
      actions: [],
      props: [],
    })
    expect(report.warningCount).toBeGreaterThan(0)
    expect(report.violations.some((v) => v.code === 'DIALOGUE_VOICE_MISSING')).toBe(
      true,
    )
    expect(report.errorCount).toBe(0)
    expect(report.ok).toBe(true)
  })

  it('动作 characterBindingId 为 null（群像）不违例', async () => {
    await seedFullAsset(ds)
    const report = await validator.validateScene({
      scene: makeScene({}),
      characters: [makeChar({ id: 'sc1', bindingId: 'cb1' })],
      dialogues: [makeDialogue({ id: 'd1', bindingId: 'cb1' })],
      actions: [makeAction({ id: 'a1', bindingId: null })],
      props: [],
    })
    expect(report.ok).toBe(true)
    expect(report.violations.some((v) => v.code === 'ACTION_CHARACTER_UNRESOLVED')).toBe(
      false,
    )
  })

  it('PROP_BINDING_MISSING + PROP_BINDING_UNRESOLVED', async () => {
    await seedFullAsset(ds)
    const report = await validator.validateScene({
      scene: makeScene({}),
      characters: [makeChar({ id: 'sc1', bindingId: 'cb1' })],
      dialogues: [],
      actions: [],
      props: [
        makeProp({ id: 'p1', itemBindingId: null, name: '匿名道具' }),
        makeProp({ id: 'p2', itemBindingId: 'ib_ghost', name: '幽灵物品' }),
      ],
    })
    const codes = report.violations.map((v) => v.code)
    expect(codes).toContain('PROP_BINDING_MISSING')
    expect(codes).toContain('PROP_BINDING_UNRESOLVED')
  })

  it('validateScenes：多场景汇总', async () => {
    await seedFullAsset(ds)
    const reports = await validator.validateScenes([
      {
        scene: makeScene({ id: 's1', num: 1 }),
        characters: [makeChar({ id: 'sc1', bindingId: 'cb1' })],
        dialogues: [],
        actions: [],
        props: [],
      },
      {
        scene: makeScene({ id: 's2', num: 2, locationBindingId: null }), // 缺 location
        characters: [],
        dialogues: [],
        actions: [],
        props: [],
      },
    ])
    expect(reports.errorCount).toBe(1)
    expect(reports.violations[0].sceneNumber).toBe(2)
  })
})
