/**
 * shot-dialogue-loader 单测（2026-10-05 台词乱码修复）
 *
 * 口径：storyboard_dialogue_links 优先；无 links 的分镜回退 dialogue_ids JSON 列；
 * links 表不存在时静默回退；其余 links 查询错误 warn 留痕后回退（M9）；
 * 两路皆空 → 该镜头无台词。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { loadShotDialogues } from '@core/platform/episode-production/render/video/shot-dialogue-loader'

const { warnSpy } = vi.hoisted(() => ({ warnSpy: vi.fn() }))
vi.mock('@core/utils/logger', () => ({
  createLogger: () => ({ info: () => {}, warn: warnSpy, error: () => {} }),
}))

let ds: DataSource

async function buildDb(withLinksTable = true): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [StoryboardEntity, SceneDialogueEntity],
    synchronize: true,
  })
  await dataSource.initialize()
  if (withLinksTable) {
    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS storyboard_dialogue_links (
        id TEXT PRIMARY KEY,
        storyboard_id TEXT NOT NULL,
        dialogue_id TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0
      )
    `)
  }
  return dataSource
}

async function seedDialogue(id: string, speaker: string, text: string, sortOrder: number): Promise<void> {
  await ds.getRepository(SceneDialogueEntity).save({
    id,
    sceneScriptId: 'scene1',
    characterId: 'c1',
    characterBindingId: null,
    characterName: speaker,
    text,
    emotion: null,
    volume: 'normal',
    pace: 'normal',
    pause: 0,
    voiceId: null,
    audioAssetId: null,
    sortOrder,
  } as any)
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

async function link(storyboardId: string, dialogueId: string, sortOrder: number): Promise<void> {
  await ds.query(
    `INSERT INTO storyboard_dialogue_links (id, storyboard_id, dialogue_id, sort_order) VALUES (?, ?, ?, ?)`,
    [`sdl_${storyboardId}_${dialogueId}`, storyboardId, dialogueId, sortOrder],
  )
}

beforeEach(async () => {
  warnSpy.mockClear()
  ds = await buildDb()
})

afterEach(async () => {
  await ds.destroy()
})

describe('loadShotDialogues', () => {
  it('links 表优先：按 sort_order 返回说话人+原文', async () => {
    await seedDialogue('d1', '沈云萝', '第一句', 0)
    await seedDialogue('d2', '秦越', '第二句', 1)
    await seedStoryboard('sb1', [])
    await link('sb1', 'd2', 1)
    await link('sb1', 'd1', 0)
    const map = await loadShotDialogues(ds, [{ id: 'sb1', dialogueIds: [] }])
    expect(map.get('sb1')).toEqual([
      { speaker: '沈云萝', text: '第一句', id: 'd1' },
      { speaker: '秦越', text: '第二句', id: 'd2' },
    ])
  })

  it('无 links 的分镜回退 dialogue_ids JSON 列', async () => {
    await seedDialogue('d1', '沈云萝', '第一句', 0)
    await seedStoryboard('sb1', ['d1'])
    const map = await loadShotDialogues(ds, [{ id: 'sb1', dialogueIds: ['d1'] }])
    expect(map.get('sb1')).toEqual([{ speaker: '沈云萝', text: '第一句', id: 'd1' }])
  })

  it('有 links 的分镜不再叠加 JSON 列（links 优先）', async () => {
    await seedDialogue('d1', '沈云萝', 'links版', 0)
    await seedDialogue('d2', '秦越', 'json版', 1)
    await seedStoryboard('sb1', ['d2'])
    await link('sb1', 'd1', 0)
    const map = await loadShotDialogues(ds, [{ id: 'sb1', dialogueIds: ['d2'] }])
    expect(map.get('sb1')).toEqual([{ speaker: '沈云萝', text: 'links版', id: 'd1' }])
  })

  it('links 表不存在 → 静默回退 JSON 列', async () => {
    await ds.destroy()
    ds = await buildDb(false)
    await seedDialogue('d1', '沈云萝', '第一句', 0)
    await seedStoryboard('sb1', ['d1'])
    const map = await loadShotDialogues(ds, [{ id: 'sb1', dialogueIds: ['d1'] }])
    expect(map.get('sb1')).toEqual([{ speaker: '沈云萝', text: '第一句', id: 'd1' }])
  })

  it('M9：表不存在（SQLite/PG 两种措辞）→ 静默回退，不打 warn', async () => {
    // SQLite 措辞（真实库，缺 links 表）
    await ds.destroy()
    ds = await buildDb(false)
    await seedDialogue('d1', '沈云萝', '第一句', 0)
    await seedStoryboard('sb1', ['d1'])
    const map = await loadShotDialogues(ds, [{ id: 'sb1', dialogueIds: ['d1'] }])
    expect(map.get('sb1')).toEqual([{ speaker: '沈云萝', text: '第一句', id: 'd1' }])
    expect(warnSpy).not.toHaveBeenCalled()

    // PG 措辞（`does not exist`，桩掉 query 直接抛错）
    warnSpy.mockClear()
    const pgDs = {
      options: { type: 'postgres' },
      query: vi.fn().mockRejectedValue(new Error('relation "storyboard_dialogue_links" does not exist')),
    } as unknown as DataSource
    const map2 = await loadShotDialogues(pgDs, [{ id: 'sb1', dialogueIds: [] }])
    expect(map2.size).toBe(0)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('M9：links 查询其他错误（非表不存在）→ warn 留痕后仍回退 JSON 列', async () => {
    // 重建为缺 sort_order 列的 links 表：查询以 `no such column` 失败（非「表不存在」措辞）
    await ds.query('DROP TABLE storyboard_dialogue_links')
    await ds.query(`
      CREATE TABLE storyboard_dialogue_links (
        id TEXT PRIMARY KEY,
        storyboard_id TEXT NOT NULL,
        dialogue_id TEXT NOT NULL
      )
    `)
    await seedDialogue('d1', '沈云萝', '第一句', 0)
    await seedStoryboard('sb1', ['d1'])
    const map = await loadShotDialogues(ds, [{ id: 'sb1', dialogueIds: ['d1'] }])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][1])).toContain('no such column')
    expect(map.get('sb1')).toEqual([{ speaker: '沈云萝', text: '第一句', id: 'd1' }])
  })

  it('两路皆空 → 该镜头无台词（不进 map）', async () => {
    await seedStoryboard('sb1', [])
    const map = await loadShotDialogues(ds, [{ id: 'sb1', dialogueIds: [] }])
    expect(map.has('sb1')).toBe(false)
  })

  it('空输入 → 空 map', async () => {
    const map = await loadShotDialogues(ds, [])
    expect(map.size).toBe(0)
  })
})
