/**
 * StoryboardCharacterService 单测（P5-T32 · spec §4.5.3）
 *
 * 验证：
 * - listByStoryboard 空时返回 []
 * - saveAll 全量替换语义（先 delete 旧的再 createMany）
 * - sortOrder 按入参顺序自动赋值
 * - clearAll 清空回退到 scene 级
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { StoryboardCharacterEntity } from '@core/database/entities/episode-production/storyboard-character.entity'
import { StoryboardCharacterService } from '@core/modules/episode-production/narrative/services/storyboard-character.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [StoryboardCharacterEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('StoryboardCharacterService', () => {
  let ds: DataSource
  let svc: StoryboardCharacterService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new StoryboardCharacterService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('listByStoryboard：空 storyboard 返回空数组', async () => {
    const list = await svc.listByStoryboard('sb_empty')
    expect(list).toEqual([])
  })

  it('listByStoryboard：空 storyboardId 返回空数组（不抛错）', async () => {
    const list = await svc.listByStoryboard('')
    expect(list).toEqual([])
  })

  it('saveAll：写入 3 条按 sortOrder 自动赋值', async () => {
    const inputs = [
      { characterId: 'cb_zhangsan', expression: 'angry', action: '怒指对方', facing: 'front' as const },
      { characterId: 'cb_lisi', expression: 'surprised', facing: 'three_quarter_left' as const },
      { characterId: 'cb_wangwu', positionX: 80, positionY: 50, positionScale: 1.2 },
    ]
    const saved = await svc.saveAll('sb1', inputs)
    expect(saved).toHaveLength(3)

    // 重新查应该按 sortOrder 升序
    const list = await svc.listByStoryboard('sb1')
    expect(list).toHaveLength(3)
    expect(list[0].characterId).toBe('cb_zhangsan')
    expect(list[1].characterId).toBe('cb_lisi')
    expect(list[2].characterId).toBe('cb_wangwu')

    expect(list[0].expression).toBe('angry')
    expect(list[0].action).toBe('怒指对方')
    expect(list[0].facing).toBe('front')
    expect(list[1].facing).toBe('three_quarter_left')
    expect(list[2].position?.scale).toBe(1.2)
  })

  it('saveAll：全量替换 — 第二次 saveAll 覆盖第一次', async () => {
    await svc.saveAll('sb1', [
      { characterId: 'cb_a', expression: 'angry' },
      { characterId: 'cb_b', expression: 'sad' },
    ])
    expect(await svc.listByStoryboard('sb1')).toHaveLength(2)

    // 第二次 save 只 1 条 → 应该把第一次的 2 条全删
    await svc.saveAll('sb1', [
      { characterId: 'cb_a', expression: 'happy' }, // 覆盖
    ])
    const list = await svc.listByStoryboard('sb1')
    expect(list).toHaveLength(1)
    expect(list[0].characterId).toBe('cb_a')
    expect(list[0].expression).toBe('happy')
  })

  it('saveAll：空入参清空该 storyboard 的全部记录', async () => {
    await svc.saveAll('sb1', [
      { characterId: 'cb_a', expression: 'angry' },
    ])
    expect(await svc.listByStoryboard('sb1')).toHaveLength(1)

    await svc.saveAll('sb1', [])
    expect(await svc.listByStoryboard('sb1')).toEqual([])
  })

  it('saveAll：不同 storyboard 互不干扰（spec §4.5.3 一场景多分镜独立）', async () => {
    await svc.saveAll('sb_1_2', [{ characterId: 'cb_zhangsan', expression: 'angry' }])
    await svc.saveAll('sb_1_3', [{ characterId: 'cb_lisi', expression: 'surprised' }])

    const list1 = await svc.listByStoryboard('sb_1_2')
    const list2 = await svc.listByStoryboard('sb_1_3')

    expect(list1).toHaveLength(1)
    expect(list1[0].expression).toBe('angry')
    expect(list2).toHaveLength(1)
    expect(list2[0].expression).toBe('surprised')
  })

  it('saveAll：空 storyboardId 抛错', async () => {
    await expect(svc.saveAll('', [])).rejects.toThrow('storyboardId 不能为空')
  })

  it('clearAll：清空让分镜回退到 scene 级', async () => {
    await svc.saveAll('sb1', [
      { characterId: 'cb_a', expression: 'angry' },
      { characterId: 'cb_b', expression: 'sad' },
    ])
    expect(await svc.listByStoryboard('sb1')).toHaveLength(2)

    await svc.clearAll('sb1')
    expect(await svc.listByStoryboard('sb1')).toEqual([])
  })
})
