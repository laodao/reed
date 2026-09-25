/**
 * replaceSceneStoryboards 事务化单测（2026-09-25 一致性修复第二批 · M1）
 *
 * 背景：旧实现 cleanupStoryboards(this.ds, ...) 内部自开事务先提交删除，随后
 * create/update/links 插入在事务外逐条裸奔——中途抛错留下「旧已删+新半截」，
 * 「失败保留旧分镜」承诺不成立。修复后删旧 + 插新 + links 包进同一个
 * ds.transaction：中途失败整体回滚。
 *
 * 覆盖：
 * - M1-a 回滚：第二镜 links 插入触发 FK 失败（悬空 dialogue_id）→
 *   replaceSceneStoryboards 抛错，旧分镜与其 links 完整保留，无新分镜/links 残留
 * - M1-b 正常路径：删旧插新同一事务提交，新分镜 binding 覆盖列/dialogueIds/
 *   links 与修复前口径一致
 * - 两个用例都装了 SQLite 串行门：事务回调内若误用全局 manager/仓库方法
 *   （如 this.storyboardRepo）会被门立即拒绝，本测试随之变红
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardCharacterEntity } from '@core/database/entities/episode-production/storyboard-character.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { installSqliteSerialGate } from '@core/database/sqlite-serial-gate'

// service 顶层引入了三个资产 service，本测试不走 binding 逻辑，mock 掉以保持导入链轻量
vi.mock('@core/platform/episode-production/assets/services/character-asset.service', () => ({
  CharacterAssetService: class {},
}))
vi.mock('@core/platform/episode-production/assets/services/location-asset.service', () => ({
  LocationAssetService: class {},
}))
vi.mock('@core/platform/episode-production/assets/services/item-asset.service', () => ({
  ItemAssetService: class {},
}))
vi.mock('@core/platform/episode-production/assets/services/asset-image.service', () => ({
  AssetImageService: class {},
}))

import { StoryboardCogenService } from '@core/platform/episode-production/narrative/services/storyboard-cogen.service'
import type { CogenOutput } from '@core/platform/episode-production/narrative/ai/storyboard-cogen'

let ds: DataSource
let svc: StoryboardCogenService

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

async function seedDialogueRow(id: string, sortOrder: number): Promise<void> {
  await ds.getRepository(SceneDialogueEntity).save({
    id,
    sceneScriptId: 'scene1',
    characterId: '',
    characterBindingId: null,
    characterName: '阿蘅',
    text: `对白 ${id}`,
    emotion: null,
    volume: 'normal',
    pace: 'normal',
    pause: 0,
    voiceId: null,
    audioAssetId: null,
    sortOrder,
  } as any)
}

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
    frameDescription: '旧分镜（应完整保留）',
    subject: null,
    composition: null,
    characters: [{ characterId: 'cb_old', position: { x: 50, y: 50, scale: 1 } }],
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
    keyframeCount: 2,
    videoProviderId: null,
    videoModelId: null,
    videoMode: null,
    use3dStaging: 0,
    stagingLayoutId: null,
    backgroundRefImageId: null,
    createdAt: now,
    updatedAt: now,
  } as any)
  await ds.query(
    `INSERT INTO storyboard_dialogue_links (id, storyboard_id, dialogue_id, sort_order) VALUES (?, ?, ?, ?)`,
    ['sdl_old_1', 'sb_old_1', 'dlg_a', 0],
  )
}

function cogenOutput(shots: Array<Partial<CogenOutput['shots'][number]>>): CogenOutput {
  return {
    assets: {
      characters: [],
      location: { name: '山道', description: '山道蜿蜒向下', existing: false },
      items: [],
    },
    shots: shots.map((s) => ({
      shotType: 'long',
      cameraAngle: 'eye_level',
      cameraMovement: 'static',
      duration: 3,
      frameDescription: '【场景】a【人物】b【动作】c【氛围】d',
      characters: [{ name: '阿蘅', position: 'left' as const }],
      itemNames: [],
      dialogueIds: [],
      ...s,
    })),
  }
}

const CHAR_BINDINGS = new Map([['阿蘅', { id: 'cb_1', name: '阿蘅', description: null }]])
const ITEM_BINDINGS = new Map([['青龙剑', { id: 'ib_1', name: '青龙剑', description: null }]])

describe('replaceSceneStoryboards 事务化（M1：删旧插新同事务）', () => {
  beforeEach(async () => {
    ds = await buildDb()
    svc = new StoryboardCogenService(ds)
    await seedDialogueRow('dlg_a', 0)
    await seedDialogueRow('dlg_b', 1)
    await seedOldStoryboard()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('M1-a：插入中途失败（links FK 抛错）→ 整体回滚，旧分镜与旧 links 完整保留、无新分镜残留', async () => {
    const output = cogenOutput([
      { dialogueIds: ['dlg_a'] },
      // 第二镜承接悬空对白 id：links 插入触发 FK 失败，模拟「插入中途抛错」
      { dialogueIds: ['dlg_missing'] },
    ])

    await expect(
      (svc as any).replaceSceneStoryboards('scene1', output, CHAR_BINDINGS, 'lb_1', ITEM_BINDINGS),
    ).rejects.toThrow()

    // 旧分镜完整保留（删旧已回滚）
    const storyboards = await ds.getRepository(StoryboardEntity).find({
      where: { sceneScriptId: 'scene1' },
    })
    expect(storyboards).toHaveLength(1)
    expect(storyboards[0]).toMatchObject({
      id: 'sb_old_1',
      frameDescription: '旧分镜（应完整保留）',
      status: 'completed',
      dialogueIds: ['dlg_a'],
    })

    // 旧 links 保留；无任何新 links 残留（第一镜的插入已随事务回滚）
    const links = await ds.query(`SELECT * FROM storyboard_dialogue_links`)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ id: 'sdl_old_1', storyboard_id: 'sb_old_1', dialogue_id: 'dlg_a' })
  })

  it('M1-b：正常路径删旧插新同一事务提交，新分镜字段与 links 口径不变', async () => {
    const output = cogenOutput([
      { dialogueIds: ['dlg_a', 'dlg_b'], itemNames: ['青龙剑'] },
      { dialogueIds: [] },
    ])

    await (svc as any).replaceSceneStoryboards('scene1', output, CHAR_BINDINGS, 'lb_1', ITEM_BINDINGS)

    const storyboards = await ds.getRepository(StoryboardEntity).find({
      where: { sceneScriptId: 'scene1' },
      order: { shotNumber: 'ASC' },
    })
    // 旧分镜已删，恰好插入 2 个新分镜（shotNumber 强制 1..N）
    expect(storyboards).toHaveLength(2)
    expect(storyboards.map((s) => s.id)).not.toContain('sb_old_1')
    expect(storyboards.map((s) => s.shotNumber)).toEqual([1, 2])
    for (const sb of storyboards) {
      expect(sb.status).toBe('pending')
      expect(sb.locationBindingIds).toEqual(['lb_1'])
      expect(sb.transition).toBe(JSON.stringify({ type: 'cut', duration: 500 }))
      const chars = sb.characters as any[]
      expect(chars[0].characterId).toBe('cb_1')
    }
    expect(storyboards[0].itemBindingIds).toEqual(['ib_1'])
    expect(storyboards[0].dialogueIds).toEqual(['dlg_a', 'dlg_b'])
    expect(storyboards[1].itemBindingIds).toEqual([])
    expect(storyboards[1].dialogueIds).toEqual([])

    // links 与 storyboards.dialogue_ids 对齐（字幕镜头级分配数据源）
    const links = await ds.query(
      `SELECT storyboard_id, dialogue_id, sort_order FROM storyboard_dialogue_links ORDER BY sort_order ASC`,
    )
    expect(links).toHaveLength(2)
    for (const l of links) {
      expect(l.storyboard_id).toBe(storyboards[0].id)
    }
    expect(links.map((l: any) => l.dialogue_id)).toEqual(['dlg_a', 'dlg_b'])
  })
})
