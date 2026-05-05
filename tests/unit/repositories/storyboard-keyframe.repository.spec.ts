/**
 * StoryboardKeyframeRepository 单测（P5-T3）
 *
 * 覆盖 CRUD + 排序 + 批量 + 删除：
 * - create / listByStoryboard 顺序
 * - createMany 事务
 * - update 部分字段
 * - delete + deleteByStoryboard
 * - defaultTimePercent: start/end/middle 默认值
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { StoryboardKeyframeRepository } from '@core/database/repositories/storyboard-keyframe.repository'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [StoryboardKeyframeEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('StoryboardKeyframeRepository', () => {
  let ds: DataSource
  let repo: StoryboardKeyframeRepository

  beforeEach(async () => {
    ds = await buildDb()
    repo = new StoryboardKeyframeRepository(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('create + listByStoryboard 按 frame_index 升序返回', async () => {
    const sb = 'sb1'
    await repo.create({ storyboardId: sb, frameIndex: 2, frameRole: 'end' })
    await repo.create({ storyboardId: sb, frameIndex: 0, frameRole: 'start' })
    await repo.create({ storyboardId: sb, frameIndex: 1, frameRole: 'middle' })

    const list = await repo.listByStoryboard(sb)
    expect(list.map((k) => k.frameIndex)).toEqual([0, 1, 2])
    expect(list.map((k) => k.frameRole)).toEqual(['start', 'middle', 'end'])
  })

  it('defaultTimePercent: start=0 / end=1 / middle=0.5', async () => {
    const sb = 'sb1'
    const s = await repo.create({ storyboardId: sb, frameIndex: 0, frameRole: 'start' })
    const e = await repo.create({ storyboardId: sb, frameIndex: 1, frameRole: 'end' })
    const m = await repo.create({ storyboardId: sb, frameIndex: 2, frameRole: 'middle' })
    expect(s.timePercent).toBe(0)
    expect(e.timePercent).toBe(1)
    expect(m.timePercent).toBe(0.5)
  })

  it('createMany 事务批量', async () => {
    const sb = 'sb1'
    const result = await repo.createMany([
      { storyboardId: sb, frameIndex: 0, frameRole: 'start' },
      { storyboardId: sb, frameIndex: 1, frameRole: 'end' },
    ])
    expect(result).toHaveLength(2)
    const list = await repo.listByStoryboard(sb)
    expect(list).toHaveLength(2)
  })

  it('update 部分字段', async () => {
    const k = await repo.create({
      storyboardId: 'sb1',
      frameIndex: 0,
      frameRole: 'start',
    })
    const updated = await repo.update(k.id, {
      imageAssetId: 'ai_xxx',
      prompt: '清晨茶馆',
    })
    expect(updated?.imageAssetId).toBe('ai_xxx')
    expect(updated?.prompt).toBe('清晨茶馆')
    expect(updated?.frameRole).toBe('start') // 未改的保留
  })

  it('delete + deleteByStoryboard', async () => {
    const sb = 'sb1'
    const k = await repo.create({ storyboardId: sb, frameIndex: 0, frameRole: 'start' })
    await repo.create({ storyboardId: sb, frameIndex: 1, frameRole: 'end' })

    expect(await repo.delete(k.id)).toBe(true)
    expect(await repo.delete('kf_ghost')).toBe(false)

    const remaining = await repo.listByStoryboard(sb)
    expect(remaining).toHaveLength(1)

    await repo.deleteByStoryboard(sb)
    expect(await repo.listByStoryboard(sb)).toHaveLength(0)
  })

  it('getById：不存在返回 null', async () => {
    expect(await repo.getById('kf_ghost')).toBeNull()
  })
})
