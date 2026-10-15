/**
 * handleGenerateStoryboards 批量路径 per-scene 事务化单测（2026-10-04 一致性修复
 * 第三批 · Task 2）
 *
 * 背景：旧批量路径 cleanupStoryboards(db.dataSource) 自开事务先提交删除，随后
 * db.storyboards.create + links 插入在事务外逐条裸奔，且 links 错误被
 * .catch(() => {}) 静默吞——中途抛错留下「旧已删 + 新半截」，links 失败无任何
 * 痕迹。修复后与单场景路径同构：per-scene 单事务（删旧 + 插新 + links，
 * insertStoryboardIn 公共 helper），某场景失败该场景整体回滚、计入
 * failedScenes，不影响其他场景。
 *
 * 覆盖：
 * - 批量-a 某场景插入中途失败（SQLite trigger 模拟 links 抛错）→ 该场景整体
 *   回滚（旧分镜/旧 links 完整保留、无新残留）、计入 failedScenes、其他场景
 *   不受影响正常落库
 * - 批量-b 正常路径：两场景删旧插新各自单事务提交，返回 DTO 为提交后
 *   getBySceneScriptId 复读口径（transition 已解析、createdAt epoch），links 对齐
 * - 批量-c 空数组守卫：AI 空结果场景计入 skippedScenes、旧分镜保留，其他场景正常
 * - 批量-d links 失败不再静默吞：failedScenes 携带可见错误信息（trigger 消息）
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

const generateStoryboardsMock = vi.fn()
const advanceEpisodeStatusMock = vi.fn()

vi.mock('@core/packs/episode-production/services/story-to-video-ai.service', () => ({
  StoryToVideoAIService: {
    getInstance: () => ({
      generateStoryboards: generateStoryboardsMock,
    }),
  },
}))

vi.mock('@core/platform/episode-production/workflow/episode-status-advance', () => ({
  advanceEpisodeStatus: (...args: unknown[]) => advanceEpisodeStatusMock(...args),
}))

let ds: DataSource
let storyboards: StoryboardRepository

const SCENES = [
  { id: 'scene1', episodeScriptId: 'script1', characters: [] },
  { id: 'scene2', episodeScriptId: 'script1', characters: [] },
]

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
        getByEpisodeScriptId: async (_scriptId: string) => SCENES,
      }
    },
    get episodeScripts() {
      return {
        getById: async (id: string) => ({ id, episodeId: 'ep1' }),
      }
    },
  }),
}))

import { invokeIpc } from '@core/ipc/ipc-bridge'
import { registerStoryboardHandlers } from '@core/packs/episode-production/handlers/narrative/storyboard.handler'

interface BatchData {
  storyboards: Array<{
    id: string
    sceneScriptId: string
    shotNumber: number
    status: string
    transition: { type: string; duration: number }
    createdAt: number
  }>
  unboundCharacters: string[]
  unboundCount: number
  skippedScenes: string[]
  failedScenes: Array<{ sceneId: string; error: string }>
}

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

async function seedDialogue(id: string, sceneId: string, sortOrder: number): Promise<void> {
  await ds.getRepository(SceneDialogueEntity).save({
    id,
    sceneScriptId: sceneId,
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

/** 预置某场景一套旧分镜：storyboards 行 + links 行 */
async function seedOldStoryboard(sceneId: string, sbId: string, dialogueId: string): Promise<void> {
  const now = new Date()
  await ds.getRepository(StoryboardEntity).save({
    id: sbId,
    sceneScriptId: sceneId,
    shotNumber: 1,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    movementDuration: null,
    frameDescription: `旧分镜（${sceneId}，失败回滚后应完整保留）`,
    subject: null,
    composition: null,
    characters: [],
    narrationId: null,
    dialogueIds: [dialogueId],
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
  await ds.query(
    `INSERT INTO storyboard_dialogue_links (id, storyboard_id, dialogue_id, sort_order) VALUES (?, ?, ?, ?)`,
    [`sdl_${sbId}`, sbId, dialogueId, 0],
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

describe('handleGenerateStoryboards 批量路径 per-scene 事务化（第三批 Task 2）', () => {
  beforeEach(async () => {
    ds = await buildDb()
    storyboards = new StoryboardRepository(ds)
    generateStoryboardsMock.mockReset()
    advanceEpisodeStatusMock.mockReset()
    registerStoryboardHandlers()
    await seedDialogue('dlg_a', 'scene1', 0)
    await seedDialogue('dlg_b', 'scene1', 1)
    await seedDialogue('dlg_c', 'scene2', 0)
    await seedDialogue('dlg_d', 'scene2', 1)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('批量-a：某场景插入中途失败（trigger 模拟）→ 该场景整体回滚、计入 failedScenes、其他场景不受影响', async () => {
    await seedOldStoryboard('scene1', 'sb_old_s1', 'dlg_a')
    await seedOldStoryboard('scene2', 'sb_old_s2', 'dlg_c')
    // links 重建已过滤悬空 id（B3-Task1 后悬空不再 FK 抛错），改用 trigger 在
    // dlg_b 的 link 插入时抛错，模拟「插入中途失败」
    await ds.query(`
      CREATE TRIGGER fail_link_dlg_b BEFORE INSERT ON storyboard_dialogue_links
      WHEN NEW.dialogue_id = 'dlg_b'
      BEGIN SELECT RAISE(FAIL, 'simulated mid-insert failure'); END
    `)
    generateStoryboardsMock.mockResolvedValue(
      new Map([
        // scene1 第二镜的 link 插入触发 trigger 抛错
        ['scene1', { storyboards: [aiShot(['dlg_a']), aiShot(['dlg_b'])] }],
        ['scene2', { storyboards: [aiShot(['dlg_c'])] }],
      ]),
    )

    const res = (await invokeIpc('ep:generate-storyboards', ['script1'])) as Resp<BatchData>
    expect(res.success).toBe(true)
    // 失败计入 failedScenes，错误信息可见
    expect(res.data!.failedScenes).toHaveLength(1)
    expect(res.data!.failedScenes[0].sceneId).toBe('scene1')
    expect(res.data!.skippedScenes).toEqual([])

    // scene1 整体回滚：旧分镜与旧 links 完整保留、无新分镜/新 links 残留
    const scene1Storyboards = await ds.getRepository(StoryboardEntity).find({
      where: { sceneScriptId: 'scene1' },
    })
    expect(scene1Storyboards).toHaveLength(1)
    expect(scene1Storyboards[0]).toMatchObject({
      id: 'sb_old_s1',
      status: 'completed',
      dialogueIds: ['dlg_a'],
    })
    expect((await linksOf('sb_old_s1')).map((l) => l.dialogue_id)).toEqual(['dlg_a'])

    // scene2 不受影响：旧分镜被删、恰好 1 个新分镜 + links 落库
    const scene2Storyboards = await ds.getRepository(StoryboardEntity).find({
      where: { sceneScriptId: 'scene2' },
    })
    expect(scene2Storyboards).toHaveLength(1)
    expect(scene2Storyboards[0].id).not.toBe('sb_old_s2')
    expect(scene2Storyboards[0].shotNumber).toBe(1)
    expect((await linksOf(scene2Storyboards[0].id)).map((l) => l.dialogue_id)).toEqual(['dlg_c'])

    // 返回的 storyboards 只含成功场景的新分镜（提交后复读口径）
    expect(res.data!.storyboards).toHaveLength(1)
    expect(res.data!.storyboards[0].sceneScriptId).toBe('scene2')

    // 部分失败仍推进 episode → storyboarding（有成功场景）
    expect(advanceEpisodeStatusMock).toHaveBeenCalledWith(ds, 'ep1', 'storyboarding')
  })

  it('批量-b：正常路径两场景各自单事务提交，DTO 复读口径与 links 对齐', async () => {
    await seedOldStoryboard('scene1', 'sb_old_s1', 'dlg_a')
    generateStoryboardsMock.mockResolvedValue(
      new Map([
        ['scene1', { storyboards: [aiShot(['dlg_a', 'dlg_b']), aiShot(['dlg_b'])] }],
        ['scene2', { storyboards: [aiShot(['dlg_c'])] }],
      ]),
    )

    const res = (await invokeIpc('ep:generate-storyboards', ['script1'])) as Resp<BatchData>
    expect(res.success).toBe(true)
    expect(res.data!.failedScenes).toEqual([])
    expect(res.data!.skippedScenes).toEqual([])

    // 返回 3 个新分镜（scene1 两个 + scene2 一个），DTO 口径：transition 已解析、
    // createdAt epoch、status pending、shotNumber 强制 1..N
    const created = res.data!.storyboards
    expect(created).toHaveLength(3)
    expect(created.map((s) => s.id)).not.toContain('sb_old_s1')
    for (const sb of created) {
      expect(sb.status).toBe('pending')
      expect(sb.transition).toEqual({ type: 'cut', duration: 500 })
      expect(typeof sb.createdAt).toBe('number')
    }
    const scene1Created = created.filter((s) => s.sceneScriptId === 'scene1')
    expect(scene1Created.map((s) => s.shotNumber)).toEqual([1, 2])

    // 库内旧分镜已删，links 与新分镜 dialogueIds 对齐
    const scene1All = await ds.getRepository(StoryboardEntity).find({
      where: { sceneScriptId: 'scene1' },
      order: { shotNumber: 'ASC' },
    })
    expect(scene1All.map((s) => s.id)).toEqual(scene1Created.map((s) => s.id))
    expect((await linksOf(scene1Created[0].id)).map((l) => l.dialogue_id)).toEqual(['dlg_a', 'dlg_b'])
    expect((await linksOf(scene1Created[0].id)).map((l) => l.sort_order)).toEqual([0, 1])
    expect((await linksOf(scene1Created[1].id)).map((l) => l.dialogue_id)).toEqual(['dlg_b'])
    const scene2Created = created.find((s) => s.sceneScriptId === 'scene2')!
    expect((await linksOf(scene2Created.id)).map((l) => l.dialogue_id)).toEqual(['dlg_c'])
  })

  it('批量-c：AI 空结果场景跳过删建、计入 skippedScenes、旧分镜保留，其他场景正常', async () => {
    await seedOldStoryboard('scene2', 'sb_old_s2', 'dlg_c')
    generateStoryboardsMock.mockResolvedValue(
      new Map([
        ['scene1', { storyboards: [aiShot(['dlg_a'])] }],
        ['scene2', { storyboards: [] }],
      ]),
    )

    const res = (await invokeIpc('ep:generate-storyboards', ['script1'])) as Resp<BatchData>
    expect(res.success).toBe(true)
    expect(res.data!.skippedScenes).toEqual(['scene2'])
    expect(res.data!.failedScenes).toEqual([])
    expect(res.data!.storyboards).toHaveLength(1)
    expect(res.data!.storyboards[0].sceneScriptId).toBe('scene1')

    // scene2 旧分镜与旧 links 完整保留（未进删建事务）
    const scene2All = await ds.getRepository(StoryboardEntity).find({
      where: { sceneScriptId: 'scene2' },
    })
    expect(scene2All).toHaveLength(1)
    expect(scene2All[0]).toMatchObject({ id: 'sb_old_s2', status: 'completed' })
    expect((await linksOf('sb_old_s2')).map((l) => l.dialogue_id)).toEqual(['dlg_c'])
  })

  it('批量-d：links 失败不再被静默吞（失败场景计入响应，错误信息可见）', async () => {
    // 旧实现 .catch(() => {}) 静默吞 links 错误；修复后失败即表面化。
    // 本用例仅一个场景且失败 → 同时命中全灭守卫（success:false + error 汇总）
    await ds.query(`
      CREATE TRIGGER fail_link_dlg_d BEFORE INSERT ON storyboard_dialogue_links
      WHEN NEW.dialogue_id = 'dlg_d'
      BEGIN SELECT RAISE(FAIL, 'simulated mid-insert failure'); END
    `)
    generateStoryboardsMock.mockResolvedValue(
      new Map([['scene2', { storyboards: [aiShot(['dlg_c', 'dlg_d'])] }]]),
    )

    const res = (await invokeIpc('ep:generate-storyboards', ['script1'])) as Resp
    expect(res.success).toBe(false)
    expect(res.error).toContain('scene2')
    expect(res.error).toContain('simulated mid-insert failure')
    // 该场景无新分镜残留（回滚）
    const scene2All = await ds.getRepository(StoryboardEntity).find({
      where: { sceneScriptId: 'scene2' },
    })
    expect(scene2All).toEqual([])
  })

  it('批量-e：全部场景写库失败（全灭）→ success=false 汇总错误、不推进 episode 状态、旧分镜保留', async () => {
    await seedOldStoryboard('scene1', 'sb_old_s1', 'dlg_a')
    // 两个场景的 links 插入都触发 trigger 抛错（全灭）
    await ds.query(`
      CREATE TRIGGER fail_all_links BEFORE INSERT ON storyboard_dialogue_links
      BEGIN SELECT RAISE(FAIL, 'simulated mid-insert failure'); END
    `)
    generateStoryboardsMock.mockResolvedValue(
      new Map([
        ['scene1', { storyboards: [aiShot(['dlg_a'])] }],
        ['scene2', { storyboards: [aiShot(['dlg_c'])] }],
      ]),
    )

    const res = (await invokeIpc('ep:generate-storyboards', ['script1'])) as Resp
    expect(res.success).toBe(false)
    // error 汇总失败场景信息（用户侧有失败信号）
    expect(res.error).toContain('2 个场景写库失败')
    expect(res.error).toContain('scene1')
    expect(res.error).toContain('scene2')

    // 全灭不推进 episode 状态
    expect(advanceEpisodeStatusMock).not.toHaveBeenCalled()

    // 两场景均回滚：scene1 旧分镜保留、scene2 无新残留
    const scene1All = await ds.getRepository(StoryboardEntity).find({
      where: { sceneScriptId: 'scene1' },
    })
    expect(scene1All).toHaveLength(1)
    expect(scene1All[0]).toMatchObject({ id: 'sb_old_s1', status: 'completed' })
    expect(await ds.getRepository(StoryboardEntity).find({ where: { sceneScriptId: 'scene2' } }))
      .toEqual([])
  })
})
