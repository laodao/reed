/**
 * storyboard_dialogue_links 维护闭环单测（2026-09-24 审计 C1/C2）
 *
 * 覆盖：
 * - (a) 批量生成路径 ep:generate-storyboards 生成后 links 正确落库（C1）
 * - (b) ep:update-storyboard 改 dialogueIds 后 links 同步；未变更不重建（C2）
 * - rebuildStoryboardDialogueLinks：先删后插、空 dialogueIds 清空 links
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { StoryboardRepository } from '@core/database/repositories/storyboard.repository'
import { rebuildStoryboardDialogueLinks } from '@core/platform/episode-production/narrative/storyboard-dialogue-links'

const generateStoryboardsMock = vi.fn()

vi.mock('@core/packs/episode-production/services/story-to-video-ai.service', () => ({
  StoryToVideoAIService: {
    getInstance: () => ({ generateStoryboards: generateStoryboardsMock }),
  },
}))

let ds: DataSource
let storyboards: StoryboardRepository

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    get dataSource() {
      return ds
    },
    get storyboards() {
      return storyboards
    },
    get sceneScripts() {
      return {
        getByEpisodeScriptId: async () => [
          { id: 'scene1', episodeScriptId: 'script1', characters: [] },
        ],
      }
    },
    get episodeScripts() {
      return undefined
    },
  }),
}))

import { invokeIpc } from '@core/ipc/ipc-bridge'
import { registerStoryboardHandlers } from '@core/packs/episode-production/handlers/narrative/storyboard.handler'

interface Resp<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

async function buildDb(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [StoryboardEntity, SceneDialogueEntity],
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
  return dataSource
}

async function seedDialogues(ids: string[]): Promise<void> {
  await ds.getRepository(SceneDialogueEntity).save(
    ids.map((id, i) => ({
      id,
      sceneScriptId: 'scene1',
      characterId: 'c1',
      characterBindingId: null,
      characterName: '张三',
      text: `台词${i + 1}`,
      emotion: null,
      volume: 'normal',
      pace: 'normal',
      pause: 0,
      voiceId: null,
      audioAssetId: null,
      sortOrder: i,
    })) as any,
  )
}

async function seedStoryboard(id: string, dialogueIds: string[]): Promise<void> {
  await ds.getRepository(StoryboardEntity).save({
    id,
    sceneScriptId: 'scene1',
    shotNumber: 1,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    frameDescription: '画面',
    dialogueIds,
    actionIds: [],
    duration: 4,
    transition: '{}',
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

function aiShot(dialogueIds: string[]): Record<string, unknown> {
  return {
    shotNumber: 0,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    frameDescription: '画面',
    subject: null,
    composition: null,
    characters: [],
    narrationId: null,
    dialogueIds,
    actionIds: [],
    duration: 4,
    transition: { type: 'cut', duration: 500 },
  }
}

async function linksOf(storyboardId: string): Promise<
  Array<{ id: string; dialogue_id: string; sort_order: number }>
> {
  return ds.query(
    `SELECT id, dialogue_id, sort_order FROM storyboard_dialogue_links
      WHERE storyboard_id = ? ORDER BY sort_order ASC`,
    [storyboardId],
  )
}

describe('storyboard_dialogue_links 维护闭环', () => {
  beforeEach(async () => {
    ds = await buildDb()
    storyboards = new StoryboardRepository(ds)
    generateStoryboardsMock.mockReset()
    registerStoryboardHandlers()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('C1：批量生成路径生成后 links 正确落库', async () => {
    await seedDialogues(['d1', 'd2', 'd3'])
    generateStoryboardsMock.mockResolvedValue(
      new Map([
        ['scene1', { storyboards: [aiShot(['d1', 'd2']), aiShot(['d3'])] }],
      ]),
    )

    const res = (await invokeIpc('ep:generate-storyboards', ['script1'])) as Resp<{
      storyboards: Array<{ id: string; dialogueIds: string[] }>
    }>
    expect(res.success).toBe(true)
    const created = res.data!.storyboards
    expect(created).toHaveLength(2)

    const links1 = await linksOf(created[0].id)
    expect(links1.map((l) => l.dialogue_id)).toEqual(['d1', 'd2'])
    expect(links1.map((l) => l.sort_order)).toEqual([0, 1])
    const links2 = await linksOf(created[1].id)
    expect(links2.map((l) => l.dialogue_id)).toEqual(['d3'])
  })

  it('C2：update-storyboard 改 dialogueIds 后 links 同步', async () => {
    await seedDialogues(['d1', 'd2'])
    const sb = await storyboards.create({
      sceneScriptId: 'scene1',
      shotNumber: 1,
      shotType: 'medium',
      cameraAngle: 'eye_level',
      cameraMovement: 'static',
      frameDescription: '画面',
      characters: [],
      dialogueIds: ['d1'],
      actionIds: [],
      duration: 4,
      transition: { type: 'cut', duration: 500 },
    } as any)
    await rebuildStoryboardDialogueLinks(ds, sb)
    const initial = await linksOf(sb.id)
    expect(initial.map((l) => l.dialogue_id)).toEqual(['d1'])

    // dialogueIds 未变更（保存其它字段 / 同值保存）→ 不重建（行 id 不变）
    const resNoop = (await invokeIpc('ep:update-storyboard', [sb.id, { duration: 6 }])) as Resp
    expect(resNoop.success).toBe(true)
    expect(await linksOf(sb.id)).toEqual(initial)

    const resSame = (await invokeIpc('ep:update-storyboard', [sb.id, { dialogueIds: ['d1'] }])) as Resp
    expect(resSame.success).toBe(true)
    expect(await linksOf(sb.id)).toEqual(initial)

    // dialogueIds 变更 → 重建 links（行 id 更换、内容同步）
    const res = (await invokeIpc('ep:update-storyboard', [
      sb.id,
      { dialogueIds: ['d2', 'd1'] },
    ])) as Resp
    expect(res.success).toBe(true)
    const rebuilt = await linksOf(sb.id)
    expect(rebuilt.map((l) => l.dialogue_id)).toEqual(['d2', 'd1'])
    expect(rebuilt.map((l) => l.sort_order)).toEqual([0, 1])
    expect(rebuilt.map((l) => l.id)).not.toContain(initial[0].id)
  })

  it('rebuildStoryboardDialogueLinks：先删后插，空 dialogueIds 清空 links', async () => {
    await seedDialogues(['d1', 'd2'])
    await seedStoryboard('sb1', ['d1'])

    await rebuildStoryboardDialogueLinks(ds, { id: 'sb1', dialogueIds: ['d1', 'd2'] })
    expect((await linksOf('sb1')).map((l) => l.dialogue_id)).toEqual(['d1', 'd2'])

    await rebuildStoryboardDialogueLinks(ds, { id: 'sb1', dialogueIds: [] })
    expect(await linksOf('sb1')).toEqual([])
  })

  it('DataSource 模式包事务：INSERT 失败时 DELETE 一并回滚，旧 links 不丢', async () => {
    // 打开 FK 让悬空 dialogue_id 的 INSERT 真实失败（与生产库 PRAGMA 一致）
    await ds.query('PRAGMA foreign_keys = ON')
    await seedDialogues(['d1'])
    await seedStoryboard('sb1', ['d1'])
    await rebuildStoryboardDialogueLinks(ds, { id: 'sb1', dialogueIds: ['d1'] })
    const before = await linksOf('sb1')
    expect(before.map((l) => l.dialogue_id)).toEqual(['d1'])

    await expect(
      rebuildStoryboardDialogueLinks(ds, { id: 'sb1', dialogueIds: ['d1', 'dangling'] }),
    ).rejects.toThrow()
    expect(await linksOf('sb1')).toEqual(before)
  })

  it('EntityManager 模式并入调用方事务，不另起事务', async () => {
    await seedDialogues(['d1'])
    await seedStoryboard('sb1', [])
    const spy = vi.spyOn(ds, 'transaction')
    await ds.transaction(async (manager) => {
      await rebuildStoryboardDialogueLinks(manager, { id: 'sb1', dialogueIds: ['d1'] })
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect((await linksOf('sb1')).map((l) => l.dialogue_id)).toEqual(['d1'])
  })
})
