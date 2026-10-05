/**
 * 无 id 老对白回填 + 落库链路单测（2026-09-25 一致性修复第二批 · M3 评审 C1/I1/⚠️1）
 *
 * 背景：合成 id（dlg_noid_*）若逃出校验层，落 storyboard_dialogue_links 时
 * FK（REFERENCES scene_dialogues(id)）必失败。治本方案 = 生成前回填真实 id
 * （StoryboardCogenService.backfillDialogueIds，JSON 回写 + 桥接行补插同事务）。
 *
 * 覆盖：
 * - ⚠️1 FK 行为探针：PRAGMA foreign_keys=ON 下悬空 dialogue_id 的 INSERT 必抛错
 * - I1-a：无桥接行场景 → 多条无 id 对白各自独立回填真实 id（互不相同、dlg_ 前缀），
 *   JSON 与 scene_dialogues 桥接行同步；有 id 对白不动
 * - I1-b：桥接行已存在（按 sortOrder 对齐）→ 复用桥接行 id 写回 JSON，不新插行
 * - I1-c：回填后走 replaceSceneStoryboards 落库，links 行 dialogue_id 与
 *   storyboards.dialogue_ids 全部命中 scene_dialogues 真实 id（FK ON 下不抛错即证）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'

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
    entities: [SceneScriptEntity, SceneDialogueEntity, StoryboardEntity],
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
  return dataSource
}

async function seedScene(dialogues: any[]): Promise<SceneScriptEntity> {
  return ds.getRepository(SceneScriptEntity).save({
    id: 'scene1',
    episodeScriptId: 'script1',
    sceneNumber: 1,
    location: '山道',
    locationBindingId: null,
    locationType: 'exterior',
    timeOfDay: 'morning',
    weather: null,
    sceneDescription: '山道蜿蜒向下',
    mood: null,
    lighting: null,
    characters: [],
    originalText: null,
    narration: null,
    narrationAudioPath: null,
    dialogues,
    actions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

async function seedBridgeRow(id: string, sortOrder: number): Promise<void> {
  await ds.getRepository(SceneDialogueEntity).save({
    id,
    sceneScriptId: 'scene1',
    characterId: '',
    characterBindingId: null,
    characterName: '阿蘅',
    text: '桥接行已有',
    emotion: null,
    volume: 'normal',
    pace: 'normal',
    pause: 0,
    voiceId: null,
    audioAssetId: null,
    sortOrder,
  } as any)
}

function cogenOutput(d1: string[], d2: string[]): CogenOutput {
  return {
    assets: {
      characters: [],
      location: { name: '山道', description: '山道蜿蜒向下', existing: false },
      items: [],
    },
    shots: [d1, d2].map((dialogueIds) => ({
      shotType: 'long',
      cameraAngle: 'eye_level',
      cameraMovement: 'static',
      duration: 3,
      frameDescription: '【场景】a【人物】b【动作】c【氛围】d',
      characters: [{ name: '阿蘅', position: 'left' as const }],
      itemNames: [],
      dialogueIds,
    })),
  }
}

const DIALOGUES_MIXED = [
  { characterName: '阿蘅', text: '第一句（无 id）', emotion: '平静' },
  { id: 'dlg_real_1', characterName: '陈舟', text: '第二句（有 id）', emotion: '愤怒' },
  { characterName: '阿蘅', text: '第三句（无 id）', emotion: '平静' },
]

describe('无 id 对白回填 + 落库链路（M3 评审 C1/I1）', () => {
  beforeEach(async () => {
    ds = await buildDb()
    svc = new StoryboardCogenService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('⚠️1 FK 探针：悬空 dialogue_id 的 links INSERT 必抛错（证实 C1 的失效机理）', async () => {
    await expect(
      ds.query(
        `INSERT INTO storyboard_dialogue_links (id, storyboard_id, dialogue_id, sort_order) VALUES (?, ?, ?, ?)`,
        ['sdl_probe', 'sb_missing', 'dlg_noid_0', 0],
      ),
    ).rejects.toThrow()
  })

  it('I1-a：无桥接行时多条无 id 对白各自独立回填，JSON 与桥接行同步；有 id 对白不动', async () => {
    const scene = await seedScene(DIALOGUES_MIXED.map((d) => ({ ...d })))

    await (svc as any).backfillDialogueIds(scene)

    const saved = await ds.getRepository(SceneScriptEntity).findOneByOrFail({ id: 'scene1' })
    const dialogues = saved.dialogues as any[]
    // 有 id 对白原样保留
    expect(dialogues[1].id).toBe('dlg_real_1')
    // 两条无 id 对白各自独立回填真实 id（互不相同、dlg_ 前缀、非合成 id）
    const id0 = dialogues[0].id
    const id2 = dialogues[2].id
    expect(id0).toMatch(/^dlg_\d+_[a-z0-9]+$/)
    expect(id2).toMatch(/^dlg_\d+_[a-z0-9]+$/)
    expect(id0).not.toBe(id2)
    expect(id0).not.toContain('noid')
    expect(id2).not.toContain('noid')
    // 桥接行同步补插（id/文本/下标对齐；有 id 的 dlg_real_1 桥接行缺失也一并补插）
    const rows = await ds.getRepository(SceneDialogueEntity).find({
      where: { sceneScriptId: 'scene1' },
      order: { sortOrder: 'ASC' },
    })
    expect(rows.map((r) => r.id)).toEqual([id0, 'dlg_real_1', id2])
    expect(rows.map((r) => r.text)).toEqual(['第一句（无 id）', '第二句（有 id）', '第三句（无 id）'])
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2])
  })

  it('I1-b：桥接行已存在（按 sortOrder 对齐）时复用其 id 写回 JSON，不新插行', async () => {
    await seedBridgeRow('dlg_bridge_2', 2)
    const scene = await seedScene(DIALOGUES_MIXED.map((d) => ({ ...d })))

    await (svc as any).backfillDialogueIds(scene)

    const saved = await ds.getRepository(SceneScriptEntity).findOneByOrFail({ id: 'scene1' })
    const dialogues = saved.dialogues as any[]
    expect(dialogues[2].id).toBe('dlg_bridge_2')
    expect(dialogues[0].id).toMatch(/^dlg_\d+_[a-z0-9]+$/)
    const rows = await ds.getRepository(SceneDialogueEntity).find({
      where: { sceneScriptId: 'scene1' },
      order: { sortOrder: 'ASC' },
    })
    // sortOrder=0 新插一行；sortOrder=1 补 dlg_real_1；sortOrder=2 复用旧行（id 未被改写）
    expect(rows.map((r) => r.id)).toEqual([dialogues[0].id, 'dlg_real_1', 'dlg_bridge_2'])
  })

  it('I1-c：回填后走 replaceSceneStoryboards，links 与 dialogue_ids 全部命中真实 id（FK ON 不抛错）', async () => {
    const scene = await seedScene(DIALOGUES_MIXED.map((d) => ({ ...d })))
    await (svc as any).backfillDialogueIds(scene)

    const saved = await ds.getRepository(SceneScriptEntity).findOneByOrFail({ id: 'scene1' })
    const ids = (saved.dialogues as any[]).map((d) => d.id)

    // 模拟 AI 按 prompt 里的真实 id 回填 dialogueIds（全覆盖：3 条对白落到 2 个镜头）
    const output = cogenOutput([ids[0], ids[1]], [ids[2]])
    const charBindings = new Map([['阿蘅', { id: 'cb_1', name: '阿蘅', description: null }]])
    await (svc as any).replaceSceneStoryboards('scene1', output, charBindings, 'lb_1', new Map())

    const realIds = new Set(
      (await ds.getRepository(SceneDialogueEntity).find({ where: { sceneScriptId: 'scene1' } })).map(
        (r) => r.id,
      ),
    )
    expect(realIds).toEqual(new Set(ids))

    const storyboards = await ds.getRepository(StoryboardEntity).find({
      where: { sceneScriptId: 'scene1' },
      order: { shotNumber: 'ASC' },
    })
    expect(storyboards).toHaveLength(2)
    for (const sb of storyboards) {
      // storyboards.dialogue_ids JSON 列只出现真实 id
      for (const d of sb.dialogueIds ?? []) expect(realIds.has(d)).toBe(true)
      const links = await ds.query(
        `SELECT dialogue_id FROM storyboard_dialogue_links WHERE storyboard_id = ? ORDER BY sort_order ASC`,
        [sb.id],
      )
      expect(links.map((l: any) => l.dialogue_id)).toEqual(sb.dialogueIds)
      // links 行 dialogue_id 全部命中 scene_dialogues 真实 id
      for (const l of links) expect(realIds.has(l.dialogue_id)).toBe(true)
    }
    // 全覆盖：3 条对白恰好各被一个镜头承接
    const allLinks = await ds.query(`SELECT dialogue_id FROM storyboard_dialogue_links`)
    expect(allLinks.map((l: any) => l.dialogue_id).sort()).toEqual([...ids].sort())
  })

  it('对白有 id 但桥接行缺失时补插桥接行；桥接行齐全时为空操作', async () => {
    const scene = await seedScene([
      { id: 'dlg_a', characterName: '阿蘅', text: '有 id 无桥接行', emotion: '平静' },
      { id: 'dlg_b', characterName: '陈舟', text: '有 id 有桥接行', emotion: '平静' },
    ])
    await seedBridgeRow('dlg_b', 1)
    const before = await ds.getRepository(SceneDialogueEntity).find({ where: { sceneScriptId: 'scene1' } })

    await (svc as any).backfillDialogueIds(scene)

    const rows = await ds.getRepository(SceneDialogueEntity).find({
      where: { sceneScriptId: 'scene1' },
      order: { sortOrder: 'ASC' },
    })
    // dlg_a 桥接行补插（id 不变）；dlg_b 行原样
    expect(rows.map((r) => r.id)).toEqual(['dlg_a', 'dlg_b'])
    expect(rows[1]).toMatchObject({ id: 'dlg_b', text: before[0].text })
    // JSON 未被改写
    const saved = await ds.getRepository(SceneScriptEntity).findOneByOrFail({ id: 'scene1' })
    expect((saved.dialogues as any[]).map((d) => d.id)).toEqual(['dlg_a', 'dlg_b'])

    // 第二次调用：桥接行已齐全 → 空操作（行数不变）
    await (svc as any).backfillDialogueIds(saved)
    expect(await ds.getRepository(SceneDialogueEntity).count({ where: { sceneScriptId: 'scene1' } })).toBe(2)
  })
})
