/**
 * ItemAssetService 单测（P3a Task 6）
 * @module tests/unit/episode-production/assets/item-asset.service
 *
 * 5 个用例覆盖物品资产的核心契约（与 character/location 对称风格）：
 * 1. linked_lw 模式 getEffectiveData：投影 lw_item.name/description + override 覆盖
 * 2. standalone 模式 getEffectiveData：直接读 standalone_*
 * 3. createStandalone：新建 standalone binding（含 follow-up #60 占位列断言）
 * 4. createLinkedLw：新建 linked_lw binding（投影 lw 字段）
 * 5. updateOverride + listByProject：完整生命周期
 *
 * 注意：lw_story_items 与 lw_story_locations 类似，本身就有 description 列，所以
 * linked_lw 模式 description 也走 override → lw 投影。物品没有变体降级（图集结构简单），
 * 不实现 pickBestVariant。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { LwItemEntity } from '@core/database/entities/lw-item.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { ItemAssetService } from '@core/platform/episode-production/assets/services/item-asset.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [VideoProjectEntity, ItemBindingEntity, LwItemEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('ItemAssetService', () => {
  let ds: DataSource
  let svc: ItemAssetService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new ItemAssetService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('linked_lw 模式：getEffectiveData 投影 lw_item 字段并被 override 覆盖', async () => {
    await ds.getRepository(LwItemEntity).save({
      id: 'lwi1',
      projectId: 'lwp1',
      name: '青龙宝剑',
      description: '锋利无比的宝剑',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(ItemBindingEntity).save({
      id: 'ib1',
      projectId: 'p1',
      longWritingItemId: 'lwi1',
      itemName: '青龙宝剑',
      sourceType: 'linked_lw',
      overrideDescription: '断裂版青龙宝剑',
      generateImages: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const eff = await svc.getEffectiveData('ib1')
    expect(eff).toMatchObject({
      name: '青龙宝剑', // override 未设 → 走 lw.name
      description: '断裂版青龙宝剑', // override 覆盖 lw.description
      source: 'linked_lw',
    })
  })

  it('standalone 模式：getEffectiveData 直接读 standalone_*', async () => {
    await ds.getRepository(ItemBindingEntity).save({
      id: 'ib2',
      projectId: 'p1',
      longWritingItemId: '',
      itemName: '神秘信件',
      sourceType: 'standalone',
      standaloneName: '神秘信件',
      standaloneDescription: '盖着火漆印的信件',
      generateImages: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const eff = await svc.getEffectiveData('ib2')
    expect(eff).toMatchObject({
      name: '神秘信件',
      description: '盖着火漆印的信件',
      source: 'standalone',
    })
  })

  it('createStandalone: 新建 standalone 物品', async () => {
    const created = await svc.createStandalone({
      projectId: 'p1',
      name: '夜行衣',
      description: '黑色紧身衣',
    })
    expect(created.id).toMatch(/^ib_[0-9a-f]{16}$/)
    expect(created.sourceType).toBe('standalone')
    expect(created.standaloneName).toBe('夜行衣')
    expect(created.standaloneDescription).toBe('黑色紧身衣')
    expect(created.projectId).toBe('p1')
    // standalone 不绑 lw（migration relax-binding-lw-id-nullable 已开放 nullable）
    expect(created.longWritingItemId).toBeNull()

    // 落库可被 getById 取到
    const loaded = await svc.getById(created.id)
    expect(loaded?.standaloneName).toBe('夜行衣')

    // getEffectiveData 投影
    const eff = await svc.getEffectiveData(created.id)
    expect(eff).toMatchObject({
      name: '夜行衣',
      description: '黑色紧身衣',
      source: 'standalone',
    })
  })

  it('createLinkedLw: 新建 linked_lw 物品（投影 lw 字段）', async () => {
    await ds.getRepository(LwItemEntity).save({
      id: 'lwi2',
      projectId: 'lwp1',
      name: '玉佩',
      description: '传家之宝',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const created = await svc.createLinkedLw({
      projectId: 'p1',
      lwItemId: 'lwi2',
      name: '玉佩',
    })
    expect(created.id).toMatch(/^ib_[0-9a-f]{16}$/)
    expect(created.sourceType).toBe('linked_lw')
    expect(created.longWritingItemId).toBe('lwi2')
    expect(created.itemName).toBe('玉佩')

    const eff = await svc.getEffectiveData(created.id)
    expect(eff).toMatchObject({
      name: '玉佩',
      description: '传家之宝',
      source: 'linked_lw',
    })
  })

  it('updateOverride + listByProject: 完整生命周期', async () => {
    // 准备一条 standalone + 一条 linked_lw（含 lw_item 数据）
    await ds.getRepository(LwItemEntity).save({
      id: 'lwi3',
      projectId: 'lwp1',
      name: '令牌',
      description: '官府令牌',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const standalone = await svc.createStandalone({
      projectId: 'p1',
      name: '面具',
      description: '黑色面具',
    })
    const linked = await svc.createLinkedLw({
      projectId: 'p1',
      lwItemId: 'lwi3',
      name: '令牌',
    })
    // 一个不同 project 的，不该出现
    await svc.createStandalone({ projectId: 'p2', name: '其它项目物品' })

    // updateOverride 覆盖 description（linked_lw）
    await svc.updateOverride(linked.id, { description: '伪造的令牌' })
    let eff = await svc.getEffectiveData(linked.id)
    expect(eff.description).toBe('伪造的令牌')
    expect(eff.name).toBe('令牌') // override.name 未设，仍走 lw.name

    // 更新 name override
    await svc.updateOverride(linked.id, { name: '腰牌' })
    eff = await svc.getEffectiveData(linked.id)
    expect(eff.name).toBe('腰牌')
    expect(eff.description).toBe('伪造的令牌') // 之前的 override 仍保留

    // 清空 override.name（显式传 null）
    await svc.updateOverride(linked.id, { name: null })
    eff = await svc.getEffectiveData(linked.id)
    expect(eff.name).toBe('令牌') // 回到 lw.name

    // updateStandalone 覆盖 standalone 字段
    await svc.updateStandalone(standalone.id, { description: '银色面具' })
    eff = await svc.getEffectiveData(standalone.id)
    expect(eff.description).toBe('银色面具')

    // listByProject 只取 p1 的两条
    const list = await svc.listByProject('p1')
    expect(list.map((b) => b.id).sort()).toEqual(
      [standalone.id, linked.id].sort(),
    )
  })

  it('createStandalone: 同名（归一化差异）已存在 → 复用已有 binding，不新建（2026-09-21 去重归一）', async () => {
    const first = await svc.createStandalone({ projectId: 'p1', name: '青龙剑' })
    const second = await svc.createStandalone({ projectId: 'p1', name: '《青龙剑》 ' })
    expect(second.id).toBe(first.id)

    const all = await svc.listByProject('p1')
    expect(all).toHaveLength(1)
  })
})
