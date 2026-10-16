/**
 * StoryboardService 单测（P3c Task 9）
 * @module tests/unit/episode-production/narrative/storyboard.service
 *
 * 1 用例覆盖 spec §4.5.10 step 4 / §4.8 背景 ref 图绑定：
 * - set/get backgroundRefImageId 三态：未绑定(null) → 绑定 → 解绑(null)
 *
 * 用 better-sqlite3 :memory: + entities=[StoryboardEntity] + synchronize:true，
 * 让 typeorm 直接按 entity 列建表（含 P3c task 1 加的 background_ref_image_id 列）。
 */

import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardService } from '@core/platform/episode-production/narrative/services/storyboard.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [StoryboardEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('StoryboardService.backgroundRefImage', () => {
  it('set/get backgroundRefImageId 三态：null → set → null', async () => {
    const ds = await buildDb()
    const svc = new StoryboardService(ds)

    // 创建一个分镜行：填齐所有 NOT NULL 字段（id / sceneScriptId / shotNumber /
    // frameDescription / transition / createdAt / updatedAt）。其余有默认值 / nullable。
    const now = new Date()
    await ds.getRepository(StoryboardEntity).save({
      id: 'sb1',
      sceneScriptId: 'ss1',
      shotNumber: 1,
      frameDescription: 'test frame',
      transition: 'cut',
      createdAt: now,
      updatedAt: now,
    } as Partial<StoryboardEntity>)

    // 初始未绑定
    expect(await svc.getBackgroundRefImageId('sb1')).toBeNull()

    // 绑定
    await svc.setBackgroundRefImage('sb1', 'ai_snap_xxx')
    expect(await svc.getBackgroundRefImageId('sb1')).toBe('ai_snap_xxx')

    // 解绑
    await svc.setBackgroundRefImage('sb1', null)
    expect(await svc.getBackgroundRefImageId('sb1')).toBeNull()

    await ds.destroy()
  })
})
