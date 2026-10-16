/**
 * scene-dialogues · updateSceneDialogueText 单测（2026-10-05 台词可编辑）
 *
 * 口径：写回 scene_dialogues.text（字幕/视频 prompt 共同数据源）；
 * 空白文本拒绝（防空台词误伤）；不存在的 id 返回 false 不抛错；
 * 空白边界 trim 后落库。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { updateSceneDialogueText } from '@core/platform/episode-production/narrative/scene-dialogues'

let ds: DataSource

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [SceneDialogueEntity],
    synchronize: true,
  })
  await ds.initialize()
  await ds.getRepository(SceneDialogueEntity).save({
    id: 'dlg_1',
    sceneScriptId: 'scene1',
    characterId: 'c1',
    characterBindingId: null,
    characterName: '沈云萝',
    text: '原文本',
    emotion: null,
    volume: 'normal',
    pace: 'normal',
    pause: 0,
    voiceId: null,
    audioAssetId: null,
    sortOrder: 1,
  } as any)
})

afterEach(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

async function textOf(id: string): Promise<string> {
  const rows = await ds.query(`SELECT text FROM scene_dialogues WHERE id = ?`, [id])
  return rows[0]?.text
}

describe('updateSceneDialogueText', () => {
  it('正常更新台词原文', async () => {
    const ok = await updateSceneDialogueText(ds, 'dlg_1', '那不正好？嘴皮子一流！')
    expect(ok).toBe(true)
    expect(await textOf('dlg_1')).toBe('那不正好？嘴皮子一流！')
  })

  it('首尾空白 trim 后落库', async () => {
    await updateSceneDialogueText(ds, 'dlg_1', '  下山吧。  ')
    expect(await textOf('dlg_1')).toBe('下山吧。')
  })

  it('空白/空文本 → 抛错，原文不动', async () => {
    await expect(updateSceneDialogueText(ds, 'dlg_1', '   ')).rejects.toThrow('台词内容不能为空')
    await expect(updateSceneDialogueText(ds, 'dlg_1', '')).rejects.toThrow('台词内容不能为空')
    expect(await textOf('dlg_1')).toBe('原文本')
  })

  it('不存在的 id → 返回 false，不抛错', async () => {
    expect(await updateSceneDialogueText(ds, 'dlg_404', '新文本')).toBe(false)
  })

  it('空 dialogueId → 抛错', async () => {
    await expect(updateSceneDialogueText(ds, '', '新文本')).rejects.toThrow('dialogueId 不能为空')
  })
})
