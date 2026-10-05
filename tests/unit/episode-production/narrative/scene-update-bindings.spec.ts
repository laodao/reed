/**
 * ep:update-scene 手动编辑下游维护单测（2026-09-24 审计 X2 · 第四批 Task 4）
 *
 * 覆盖：
 * - (a) 改对白文本 → bridge scene_dialogues 同步重建、该对白 JSON audioAsset
 *   与 bridge audio_asset_id 清除；未改对白两者都保留、id 不变
 * - (b) 改 narration → narration_audio_path 清除；narration 未变 / 显式传
 *   narrationAudioPath 时不清
 * - 删对白 → 该场景分镜 links 按存活 dialogueIds 重建（FK CASCADE 后不留悬空）
 * - 未触到的集合（characters/actions）bridge 行不动
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { SceneCharacterEntity } from '@core/database/entities/episode-production/scene-character.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { SceneActionEntity } from '@core/database/entities/episode-production/scene-action.entity'
import { ScenePropEntity } from '@core/database/entities/episode-production/scene-prop.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { SceneScriptRepository } from '@core/database/repositories/scene-script.repository'

vi.mock('@core/packs/episode-production/services/story-to-video-ai.service', () => ({
  StoryToVideoAIService: { getInstance: () => ({}) },
}))

let ds: DataSource
let sceneScripts: SceneScriptRepository

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    get dataSource() {
      return ds
    },
    get sceneScripts() {
      return sceneScripts
    },
  }),
}))

import { invokeIpc } from '@core/ipc/ipc-bridge'
import { registerScriptHandlers } from '@core/packs/episode-production/handlers/narrative/script.handler'

interface Resp<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

async function buildDb(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      SceneScriptEntity,
      SceneCharacterEntity,
      SceneDialogueEntity,
      SceneActionEntity,
      ScenePropEntity,
      StoryboardEntity,
    ],
    synchronize: true,
  })
  await dataSource.initialize()
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS storyboard_dialogue_links (
      id TEXT PRIMARY KEY,
      storyboard_id TEXT NOT NULL,
      dialogue_id TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
      FOREIGN KEY (dialogue_id) REFERENCES scene_dialogues(id) ON DELETE CASCADE
    )
  `)
  await dataSource.query('PRAGMA foreign_keys = ON')
  return dataSource
}

function audioAsset(text: string) {
  return { id: `audio_${text}`, type: 'dialogue', text, audioPath: `audio/${text}.mp3` }
}

async function seedScene(): Promise<void> {
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
    characters: [{ characterId: 'c1', characterName: '张三' }],
    originalText: '',
    narration: '旧旁白',
    narrationAudioPath: 'audio/narration.mp3',
    dialogues: [
      { id: 'dlg1', characterId: 'c1', characterName: '张三', text: '旧台词一', audioAsset: audioAsset('旧台词一') },
      { id: 'dlg2', characterId: 'c1', characterName: '张三', text: '旧台词二', audioAsset: audioAsset('旧台词二') },
    ],
    actions: [{ id: 'act1', characterId: 'c1', description: '起身', timing: 'during' }],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  await ds.getRepository(SceneDialogueEntity).save([
    {
      id: 'dlg1', sceneScriptId: 's1', characterId: 'c1', characterBindingId: null,
      characterName: '张三', text: '旧台词一', emotion: null, volume: 'normal',
      pace: 'normal', pause: 0, voiceId: null, audioAssetId: 'asset_1', sortOrder: 0,
    },
    {
      id: 'dlg2', sceneScriptId: 's1', characterId: 'c1', characterBindingId: null,
      characterName: '张三', text: '旧台词二', emotion: null, volume: 'normal',
      pace: 'normal', pause: 0, voiceId: null, audioAssetId: 'asset_2', sortOrder: 1,
    },
  ] as any)
  await ds.getRepository(SceneActionEntity).save({
    id: 'act1', sceneScriptId: 's1', characterId: 'c1', characterBindingId: null,
    description: '起身', timing: 'during', duration: null, sortOrder: 0,
  } as any)
  await ds.getRepository(SceneCharacterEntity).save({
    id: 'sc1', sceneScriptId: 's1', characterId: 'c1', characterName: '张三',
    characterBindingId: null, position: 'center', expression: null, action: null,
    outfit: null, sortOrder: 0,
  } as any)
}

async function seedStoryboardWithLinks(): Promise<void> {
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
      ('link_1', 'sb1', 'dlg1', 0),
      ('link_2', 'sb1', 'dlg2', 1)`,
  )
}

async function dialogueRows(): Promise<SceneDialogueEntity[]> {
  return ds.getRepository(SceneDialogueEntity).find({
    where: { sceneScriptId: 's1' } as any,
    order: { sortOrder: 'ASC' },
  })
}

async function linksOf(storyboardId: string): Promise<Array<{ dialogue_id: string }>> {
  return ds.query(
    `SELECT dialogue_id FROM storyboard_dialogue_links
      WHERE storyboard_id = ? ORDER BY sort_order ASC`,
    [storyboardId],
  )
}

describe('ep:update-scene 下游维护（X2）', () => {
  beforeEach(async () => {
    ds = await buildDb()
    sceneScripts = new SceneScriptRepository(ds)
    registerScriptHandlers()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('(a) 改对白文本：bridge 同步重建，改过的清音频、未改的保留', async () => {
    await seedScene()

    const res = (await invokeIpc('ep:update-scene', [
      's1',
      {
        dialogues: [
          { id: 'dlg1', characterId: 'c1', characterName: '张三', text: '新台词一', audioAsset: audioAsset('旧台词一') },
          { id: 'dlg2', characterId: 'c1', characterName: '张三', text: '旧台词二', audioAsset: audioAsset('旧台词二') },
        ],
      },
    ])) as Resp<{ dialogues: Array<{ id: string; text: string; audioAsset?: unknown }> }>
    expect(res.success).toBe(true)

    // JSON 列：改过的 audioAsset 作废，未改的保留；id 不变
    const out = res.data!.dialogues
    expect(out.map(d => d.id)).toEqual(['dlg1', 'dlg2'])
    expect(out[0].text).toBe('新台词一')
    expect(out[0].audioAsset).toBeUndefined()
    expect(out[1].audioAsset).toEqual(audioAsset('旧台词二'))

    // bridge 表同步：文本更新、id 保留；改过的 audio_asset_id 清、未改的保留
    const rows = await dialogueRows()
    expect(rows.map(r => r.id)).toEqual(['dlg1', 'dlg2'])
    expect(rows[0].text).toBe('新台词一')
    expect(rows[0].audioAssetId).toBeNull()
    expect(rows[1].text).toBe('旧台词二')
    expect(rows[1].audioAssetId).toBe('asset_2')

    // 未触到的集合 bridge 行不动
    expect(await ds.getRepository(SceneCharacterEntity).find()).toHaveLength(1)
    expect(await ds.getRepository(SceneActionEntity).find()).toHaveLength(1)

    // narration 未触到 → narration_audio_path 保留
    const scene = await ds.getRepository(SceneScriptEntity).findOne({ where: { id: 's1' } })
    expect(scene?.narrationAudioPath).toBe('audio/narration.mp3')
  })

  it('(b) 改 narration 清 narration_audio_path；未变 / 显式传值不清', async () => {
    await seedScene()

    // narration 未变 → 保留
    const resSame = (await invokeIpc('ep:update-scene', ['s1', { narration: '旧旁白' }])) as Resp
    expect(resSame.success).toBe(true)
    let scene = await ds.getRepository(SceneScriptEntity).findOne({ where: { id: 's1' } })
    expect(scene?.narrationAudioPath).toBe('audio/narration.mp3')

    // narration 变化 → 清
    const resChanged = (await invokeIpc('ep:update-scene', ['s1', { narration: '新旁白' }])) as Resp<{
      narrationAudioPath?: string | null
    }>
    expect(resChanged.success).toBe(true)
    expect(resChanged.data!.narrationAudioPath).toBeNull()
    scene = await ds.getRepository(SceneScriptEntity).findOne({ where: { id: 's1' } })
    expect(scene?.narration).toBe('新旁白')
    expect(scene?.narrationAudioPath).toBeNull()

    // narration 变化但本次显式给了新音频路径 → 用新值
    const resExplicit = (await invokeIpc('ep:update-scene', [
      's1',
      { narration: '又一版旁白', narrationAudioPath: 'audio/narration-v2.mp3' },
    ])) as Resp
    expect(resExplicit.success).toBe(true)
    scene = await ds.getRepository(SceneScriptEntity).findOne({ where: { id: 's1' } })
    expect(scene?.narrationAudioPath).toBe('audio/narration-v2.mp3')
  })

  it('删对白：bridge 行删除且该场景分镜 links 按存活 dialogueIds 重建', async () => {
    await seedScene()
    await seedStoryboardWithLinks()

    const res = (await invokeIpc('ep:update-scene', [
      's1',
      {
        dialogues: [
          { id: 'dlg2', characterId: 'c1', characterName: '张三', text: '旧台词二', audioAsset: audioAsset('旧台词二') },
        ],
      },
    ])) as Resp
    expect(res.success).toBe(true)

    const rows = await dialogueRows()
    expect(rows.map(r => r.id)).toEqual(['dlg2'])
    // dlg1 被删后 FK CASCADE 清 links，重建只留存活的 dlg2
    expect((await linksOf('sb1')).map(l => l.dialogue_id)).toEqual(['dlg2'])
  })

  it('仅改标量字段（mood）：不动 bridge 表', async () => {
    await seedScene()

    const res = (await invokeIpc('ep:update-scene', ['s1', { mood: '紧张' }])) as Resp<{ mood: string }>
    expect(res.success).toBe(true)
    expect(res.data!.mood).toBe('紧张')

    const rows = await dialogueRows()
    expect(rows).toHaveLength(2)
    expect(rows[0].audioAssetId).toBe('asset_1')
  })

  it('场景不存在 → success:false', async () => {
    const res = (await invokeIpc('ep:update-scene', ['nope', { narration: 'x' }])) as Resp
    expect(res.success).toBe(false)
    expect(res.error).toBe('场景不存在')
  })
})
