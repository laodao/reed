/**
 * SceneBindingWriter.rewriteSceneWithBindings 对白 links 重建单测（2026-09-24 审计 C3）
 *
 * 覆盖：删建 scene_dialogues 时 FK CASCADE 把该场景分镜的 links 静默删掉，
 * 重写完成后须按该场景所有分镜的 dialogueIds JSON 重建 links。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { SceneCharacterEntity } from '@core/database/entities/episode-production/scene-character.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { SceneActionEntity } from '@core/database/entities/episode-production/scene-action.entity'
import { ScenePropEntity } from '@core/database/entities/episode-production/scene-prop.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { SceneBindingWriter } from '@core/platform/episode-production/narrative/scene-binding-writer'
import type { GeneratedScene } from '@shared/types/episode-production'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      SceneScriptEntity,
      SceneCharacterEntity,
      SceneDialogueEntity,
      SceneActionEntity,
      ScenePropEntity,
      LocationBindingEntity,
      CharacterBindingEntity,
      StoryboardEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  await ds.query(`
    CREATE TABLE IF NOT EXISTS storyboard_dialogue_links (
      id TEXT PRIMARY KEY,
      storyboard_id TEXT NOT NULL,
      dialogue_id TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
      FOREIGN KEY (dialogue_id) REFERENCES scene_dialogues(id) ON DELETE CASCADE
    )
  `)
  // 打开 FK 让 scene_dialogues 删除真实级联清 links（与生产库 PRAGMA 一致）
  await ds.query('PRAGMA foreign_keys = ON')
  return ds
}

function dialogueRow(id: string, text: string, sortOrder: number) {
  return {
    id,
    sceneScriptId: 's1',
    characterId: 'c1',
    characterBindingId: null,
    characterName: '张三',
    text,
    emotion: null,
    volume: 'normal',
    pace: 'normal',
    pause: 0,
    voiceId: null,
    audioAssetId: null,
    sortOrder,
  }
}

async function seed(): Promise<void> {
  await ds.getRepository(SceneScriptEntity).save({
    id: 's1',
    episodeScriptId: 'es1',
    sceneNumber: 1,
    location: '茶馆',
    locationBindingId: null,
    locationType: 'interior',
    timeOfDay: 'morning',
    weather: null,
    sceneDescription: '旧描述',
    mood: '安静',
    lighting: null,
    characters: [],
    originalText: '',
    narration: '',
    dialogues: [],
    actions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  await ds.getRepository(SceneDialogueEntity).save([
    dialogueRow('dlg1', '旧台词一', 0),
    dialogueRow('dlg2', '旧台词二', 1),
  ] as any)
  await ds.getRepository(StoryboardEntity).save({
    id: 'sb1',
    sceneScriptId: 's1',
    shotNumber: 1,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    frameDescription: '画面',
    dialogueIds: ['dlg1', 'dlg2'],
    actionIds: [],
    duration: 4,
    transition: '{}',
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  await ds.query(
    `INSERT INTO storyboard_dialogue_links (id, storyboard_id, dialogue_id, sort_order) VALUES
      ('old_link_1', 'sb1', 'dlg1', 0),
      ('old_link_2', 'sb1', 'dlg2', 1)`,
  )
}

let ds: DataSource

describe('SceneBindingWriter.rewriteSceneWithBindings links 重建', () => {
  beforeEach(async () => {
    ds = await buildDb()
    await seed()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('C3：删建 scene_dialogues 后按分镜 dialogueIds 重建 links', async () => {
    const generated: GeneratedScene = {
      sceneNumber: 1,
      location: '茶馆',
      locationBindingId: null,
      locationType: 'interior',
      timeOfDay: 'morning',
      sceneDescription: '新描述',
      mood: '安静',
      characters: [],
      originalText: '',
      narration: '',
      dialogues: [
        { id: 'dlg1', characterBindingId: null, characterId: 'c1', characterName: '张三', text: '新台词一' },
        { id: 'dlg2', characterBindingId: null, characterId: 'c1', characterName: '张三', text: '新台词二' },
      ],
      actions: [],
    }

    await SceneBindingWriter.rewriteSceneWithBindings(ds, 's1', generated)

    // 对白已按新数据重建
    const dialogues = await ds.getRepository(SceneDialogueEntity).find({
      where: { sceneScriptId: 's1' },
      order: { sortOrder: 'ASC' },
    })
    expect(dialogues.map((d) => d.text)).toEqual(['新台词一', '新台词二'])

    // links 随 cascade 被删后由重建逻辑补回：仍指向 dlg1/dlg2，但旧行 id 已不存在
    const links = (await ds.query(
      `SELECT id, dialogue_id, sort_order FROM storyboard_dialogue_links
        WHERE storyboard_id = 'sb1' ORDER BY sort_order ASC`,
    )) as Array<{ id: string; dialogue_id: string; sort_order: number }>
    expect(links.map((l) => l.dialogue_id)).toEqual(['dlg1', 'dlg2'])
    expect(links.map((l) => l.id)).not.toContain('old_link_1')
    expect(links.map((l) => l.id)).not.toContain('old_link_2')
  })
})

/**
 * S3（2026-09-24 审计）：createScenesWithBindings 写库前对整批场景统一重发
 * dlg_/act_ id —— AI 每场从 dlg_1 编号，信任之必然跨场景撞主键，save 变
 * upsert 静默覆盖前一场；JSON 列与桥接表必须写入同一份重发后的 id。
 */
describe('SceneBindingWriter.createScenesWithBindings dlg_/act_ id 重发', () => {
  beforeEach(async () => {
    ds = await buildDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  function makeScene(sceneNumber: number, name: string): GeneratedScene {
    return {
      sceneNumber,
      location: '茶馆',
      locationBindingId: null,
      locationType: 'interior',
      timeOfDay: 'morning',
      sceneDescription: `第 ${sceneNumber} 场`,
      mood: '安静',
      characters: [],
      originalText: '',
      narration: '',
      dialogues: [
        { id: 'dlg_1', characterBindingId: null, characterId: 'c1', characterName: name, text: `${name}台词一` },
        { id: 'dlg_2', characterBindingId: null, characterId: 'c1', characterName: name, text: `${name}台词二` },
      ],
      actions: [
        { id: 'act_1', characterBindingId: null, characterId: 'c1', description: `${name}动作`, timing: 'during' },
      ],
    }
  }

  it('多场景 AI 重号输入：桥接表行数完整（无覆盖丢失）、id 全局唯一', async () => {
    await SceneBindingWriter.createScenesWithBindings(ds, 'es1', [
      makeScene(1, '张三'),
      makeScene(2, '李四'),
      makeScene(3, '王五'),
    ])

    const dialogues = await ds.getRepository(SceneDialogueEntity).find()
    const actions = await ds.getRepository(SceneActionEntity).find()

    // 3 场 × 2 对白 / 1 动作，若撞主键 upsert 会静默丢行
    expect(dialogues).toHaveLength(6)
    expect(actions).toHaveLength(3)
    expect(new Set(dialogues.map((d) => d.id)).size).toBe(6)
    expect(new Set(actions.map((a) => a.id)).size).toBe(3)
    // 每场两行对白都还在（被覆盖时只剩最后一场的文本）
    expect(dialogues.map((d) => d.text).sort()).toEqual(
      ['张三台词一', '张三台词二', '李四台词一', '李四台词二', '王五台词一', '王五台词二'].sort(),
    )
  })

  it('scene_scripts JSON 列 id 与桥接表 id 一致', async () => {
    const created = await SceneBindingWriter.createScenesWithBindings(ds, 'es1', [
      makeScene(1, '张三'),
      makeScene(2, '李四'),
    ])

    for (const scene of created) {
      const bridgeDialogues = await ds.getRepository(SceneDialogueEntity).find({
        where: { sceneScriptId: scene.id },
        order: { sortOrder: 'ASC' },
      })
      const bridgeActions = await ds.getRepository(SceneActionEntity).find({
        where: { sceneScriptId: scene.id },
        order: { sortOrder: 'ASC' },
      })
      const row = await ds.getRepository(SceneScriptEntity).findOne({
        where: { id: scene.id },
      })
      const jsonDialogues = (row?.dialogues ?? []) as Array<{ id: string }>
      const jsonActions = (row?.actions ?? []) as Array<{ id: string }>

      expect(jsonDialogues.map((d) => d.id)).toEqual(bridgeDialogues.map((d) => d.id))
      expect(jsonActions.map((a) => a.id)).toEqual(bridgeActions.map((a) => a.id))
      // 返回 DTO 的 id 也与落库 id 一致
      expect(scene.dialogues.map((d) => d.id)).toEqual(bridgeDialogues.map((d) => d.id))
      expect(scene.actions.map((a) => a.id)).toEqual(bridgeActions.map((a) => a.id))
    }
  })
})
