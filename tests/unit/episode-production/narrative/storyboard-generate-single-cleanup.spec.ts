/**
 * handleGenerateStoryboard 删旧建新事务化单测（2026-09-25 一致性修复第二批 · M2）
 *
 * 背景：旧实现对已有分镜的场景再次调用 ep:generate-storyboard 时直接 create
 * 追加，旧分镜及其 links 全部残留——同场景双份分镜进时间线、导出翻倍
 * （前端 store 整体覆盖恰好掩盖，刷新页面现形）。修复后：创建前对该场景
 * cleanupStoryboards 删旧，删旧 + 插新 + links 包进同一个 ds.transaction
 * （同 B2-Task3 replaceSceneStoryboards 口径），中途失败整体回滚。
 *
 * 覆盖：
 * - M2-a 已有分镜场景重复生成 → 只剩一套新分镜，旧分镜/旧 links/旧
 *   storyboard_characters 全部被清理
 * - M2-b 新分镜的 links 正确落库（dialogueIds 顺序 → sort_order）
 * - M2-c 无旧分镜首次调用行为不变（返回值 DTO 口径：transition 已解析）
 * - M2-d 插入中途失败（links FK 抛错）→ 整体回滚，旧分镜与旧 links 完整保留
 * - 全部用例装 SQLite 串行门：事务回调内若误用全局 manager/仓库方法
 *   （如 db.storyboards.create）会被门立即拒绝，本测试随之变红
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardCharacterEntity } from '@core/database/entities/episode-production/storyboard-character.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { StoryboardRepository } from '@core/database/repositories/storyboard.repository'
import { installSqliteSerialGate } from '@core/database/sqlite-serial-gate'

const generateStoryboardsIncrementalMock = vi.fn()

vi.mock('@core/packs/episode-production/services/story-to-video-ai.service', () => ({
  StoryToVideoAIService: {
    getInstance: () => ({
      generateStoryboardsIncremental: generateStoryboardsIncrementalMock,
    }),
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
        getById: async (id: string) => ({ id, episodeScriptId: 'script1', characters: [] }),
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
    entities: [
      SceneDialogueEntity,
      StoryboardEntity,
      StoryboardCharacterEntity,
      StoryboardKeyframeEntity,
      EpVideoSegmentEntity,
      ImageAssetEntity,
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
  // 与生产库一致：打开 FK，让悬空 dialogue_id 的 INSERT 真实失败
  await dataSource.query('PRAGMA foreign_keys = ON')
  // 装串行门：事务回调内误用全局 manager/仓库方法立即抛错（防回归）
  installSqliteSerialGate(dataSource)
  return dataSource
}

async function seedDialogue(id: string, sortOrder: number): Promise<void> {
  await ds.getRepository(SceneDialogueEntity).save({
    id,
    sceneScriptId: 'scene1',
    characterId: 'c1',
    characterBindingId: null,
    characterName: '张三',
    text: `台词 ${id}`,
    emotion: null,
    volume: 'normal',
    pace: 'normal',
    pause: 0,
    voiceId: null,
    audioAssetId: null,
    sortOrder,
  } as any)
}

/** 预置一套旧分镜：storyboards 行 + links 行 + storyboard_characters 行 */
async function seedOldStoryboard(): Promise<void> {
  const now = new Date()
  await ds.getRepository(StoryboardEntity).save({
    id: 'sb_old_1',
    sceneScriptId: 'scene1',
    shotNumber: 1,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    movementDuration: null,
    frameDescription: '旧分镜（重复生成后应被清理）',
    subject: null,
    composition: null,
    characters: [],
    narrationId: null,
    dialogueIds: ['dlg_a'],
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
    createdAt: now,
    updatedAt: now,
  } as any)
  await ds.getRepository(StoryboardCharacterEntity).save({
    id: 'sbc_old_1',
    storyboardId: 'sb_old_1',
    characterId: 'cb_old',
    positionX: 50,
    positionY: 50,
    positionScale: 1,
    expression: null,
    action: null,
    facing: 'front',
    sortOrder: 0,
  } as any)
  await ds.query(
    `INSERT INTO storyboard_dialogue_links (id, storyboard_id, dialogue_id, sort_order) VALUES (?, ?, ?, ?)`,
    ['sdl_old_1', 'sb_old_1', 'dlg_a', 0],
  )
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

describe('handleGenerateStoryboard 删旧建新事务化（M2）', () => {
  beforeEach(async () => {
    ds = await buildDb()
    storyboards = new StoryboardRepository(ds)
    generateStoryboardsIncrementalMock.mockReset()
    registerStoryboardHandlers()
    await seedDialogue('dlg_a', 0)
    await seedDialogue('dlg_b', 1)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('M2-a：已有分镜场景重复生成 → 只剩一套新分镜，旧分镜/旧 links/旧 characters 被清理', async () => {
    await seedOldStoryboard()
    generateStoryboardsIncrementalMock.mockResolvedValue({
      storyboards: [aiShot(['dlg_a']), aiShot(['dlg_b'])],
    })

    const res = (await invokeIpc('ep:generate-storyboard', ['scene1'])) as Resp<
      Array<{ id: string; shotNumber: number }>
    >
    expect(res.success).toBe(true)
    expect(res.data).toHaveLength(2)
    expect(res.data!.map((s) => s.id)).not.toContain('sb_old_1')

    // 全表只剩 2 个新分镜（无双份残留），shotNumber 强制 1..N
    const all = await ds.getRepository(StoryboardEntity).find({
      where: { sceneScriptId: 'scene1' },
      order: { shotNumber: 'ASC' },
    })
    expect(all).toHaveLength(2)
    expect(all.map((s) => s.shotNumber)).toEqual([1, 2])
    expect(all.map((s) => s.id)).not.toContain('sb_old_1')

    // 旧 links / 旧 storyboard_characters 级联清理
    expect(await linksOf('sb_old_1')).toEqual([])
    const oldChars = await ds.getRepository(StoryboardCharacterEntity).find({
      where: { storyboardId: 'sb_old_1' },
    })
    expect(oldChars).toEqual([])

    // 全表 links 均归属新分镜
    const allLinks = await ds.query(`SELECT storyboard_id FROM storyboard_dialogue_links`)
    expect(allLinks).toHaveLength(2)
    for (const l of allLinks) {
      expect(all.map((s) => s.id)).toContain(l.storyboard_id)
    }
  })

  it('M2-b：新分镜的 links 正确落库（dialogueIds 顺序 → sort_order）', async () => {
    generateStoryboardsIncrementalMock.mockResolvedValue({
      storyboards: [aiShot(['dlg_a', 'dlg_b']), aiShot(['dlg_b'])],
    })

    const res = (await invokeIpc('ep:generate-storyboard', ['scene1'])) as Resp<
      Array<{ id: string }>
    >
    expect(res.success).toBe(true)
    const created = res.data!
    expect(created).toHaveLength(2)

    const links1 = await linksOf(created[0].id)
    expect(links1.map((l) => l.dialogue_id)).toEqual(['dlg_a', 'dlg_b'])
    expect(links1.map((l) => l.sort_order)).toEqual([0, 1])
    const links2 = await linksOf(created[1].id)
    expect(links2.map((l) => l.dialogue_id)).toEqual(['dlg_b'])
  })

  it('M2-c：无旧分镜首次调用行为不变（返回值 DTO 口径）', async () => {
    generateStoryboardsIncrementalMock.mockResolvedValue({
      storyboards: [aiShot(['dlg_a']), aiShot([])],
    })

    const res = (await invokeIpc('ep:generate-storyboard', ['scene1'])) as Resp<
      Array<{
        id: string
        shotNumber: number
        status: string
        transition: { type: string; duration: number }
        createdAt: number
      }>
    >
    expect(res.success).toBe(true)
    const created = res.data!
    expect(created).toHaveLength(2)
    expect(created.map((s) => s.shotNumber)).toEqual([1, 2])
    for (const sb of created) {
      expect(sb.status).toBe('pending')
      // DTO 口径同原 create 返回值：transition 已解析为对象、createdAt 为 epoch ms
      expect(sb.transition).toEqual({ type: 'cut', duration: 500 })
      expect(typeof sb.createdAt).toBe('number')
    }
  })

  it('M2-e：AI 返回空分镜 → success=false，不进删建事务，旧分镜/旧 links/旧 characters 完整保留', async () => {
    await seedOldStoryboard()
    generateStoryboardsIncrementalMock.mockResolvedValue({ storyboards: [] })

    const res = (await invokeIpc('ep:generate-storyboard', ['scene1'])) as Resp
    expect(res.success).toBe(false)
    expect(res.error).toContain('AI 未返回有效分镜')

    // 旧分镜完整保留（未进删建事务）
    const all = await ds.getRepository(StoryboardEntity).find({
      where: { sceneScriptId: 'scene1' },
    })
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({
      id: 'sb_old_1',
      status: 'completed',
      dialogueIds: ['dlg_a'],
    })
    expect((await linksOf('sb_old_1')).map((l) => l.dialogue_id)).toEqual(['dlg_a'])
    const chars = await ds.getRepository(StoryboardCharacterEntity).find({
      where: { storyboardId: 'sb_old_1' },
    })
    expect(chars).toHaveLength(1)
  })

  it('M2-d：插入中途失败（trigger 模拟抛错）→ 整体回滚，旧分镜与旧 links 完整保留、无新残留', async () => {
    await seedOldStoryboard()
    // links 重建已过滤悬空 id（storyboard-dialogue-links 修复后悬空不再 FK 抛错），
    // 改用 trigger 在第二条 link 插入时抛错，模拟「插入中途失败」
    await ds.query(`
      CREATE TRIGGER fail_link_dlg_b BEFORE INSERT ON storyboard_dialogue_links
      WHEN NEW.dialogue_id = 'dlg_b'
      BEGIN SELECT RAISE(FAIL, 'simulated mid-insert failure'); END
    `)
    generateStoryboardsIncrementalMock.mockResolvedValue({
      storyboards: [
        aiShot(['dlg_a']),
        // 第二镜的 link 插入触发 trigger 抛错，模拟「插入中途抛错」
        aiShot(['dlg_b']),
      ],
    })

    const res = (await invokeIpc('ep:generate-storyboard', ['scene1'])) as Resp
    expect(res.success).toBe(false)

    // 旧分镜完整保留（删旧已回滚）
    const all = await ds.getRepository(StoryboardEntity).find({
      where: { sceneScriptId: 'scene1' },
    })
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({
      id: 'sb_old_1',
      frameDescription: '旧分镜（重复生成后应被清理）',
      status: 'completed',
      dialogueIds: ['dlg_a'],
    })

    // 旧 links / 旧 characters 保留；无任何新 links 残留（第一镜插入已随事务回滚）
    const links = await ds.query(`SELECT * FROM storyboard_dialogue_links`)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      id: 'sdl_old_1',
      storyboard_id: 'sb_old_1',
      dialogue_id: 'dlg_a',
    })
    const chars = await ds.getRepository(StoryboardCharacterEntity).find({
      where: { storyboardId: 'sb_old_1' },
    })
    expect(chars).toHaveLength(1)
  })
})
